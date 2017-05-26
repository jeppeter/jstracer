const tracer = require('tracer');
const util = require('util');
const fs = require('fs');

let _innerLogger = null;

const add_write_streams = function(self, arfiles, isappend) {
    let openflags;
    openflags = 'w+';
    if (isappend) {
        openflags = 'a+';
    }
    arfiles.forEach(elm => {
        const ws = fs.createWriteStream(elm, {
            flags: openflags,
            defaultEncoding: 'utf8',
            autoclose: true,
        });
        ws.on('error', err => {
            let i;
            console.error('error on %s (%s)', elm, err);
            for (i = 0; i < self.writeStreams.length; i += 1) {
                if (self.writeStreams[i] === ws) {
                    self.writeStreams.splice(i, 1);
                    break;
                }
            }
        });
        ws.on('data', data => {
            if (!self.noconsole) {
                console.log('data (%s) %s', data, elm);
            }
        });
        ws.on('close', () => {
            if (!self.noconsole) {
                console.log('%s closed', elm);
            }
        });
        self.writeStreams.push(ws);
    });
};

const format_string = function(...args) {
    return util.format(...args);
};

function TraceLog(options) {
    const self = this;
    this.level = 'error';
    this.writeStreams = [];
    this.waitStreams = [];
    this.stackindex = 1;
    this.noconsole = false;
    this.finish_need_counts = 0;
    this.finish_counts = 0;
    this.real_finish_callback = null;
    this.finish_callback = function(err) {
        self.finish_counts += 1;
        if (err) {
            if (self.real_finish_callback !== null) {
                self.real_finish_callback(err);
            }
        }
        if (self.finish_counts === self.finish_need_counts) {
            if (self.real_finish_callback !== null) {
                self.real_finish_callback(null);
            }
        }
    };
    this.finish = function(callback) {
        let ws;
        self.finish_need_counts = self.writeStreams.length;
        self.finish_counts = 0;
        self.real_finish_callback = callback || null;
        // var idx;
        while (self.writeStreams.length > 0) {
            ws = self.writeStreams[0];
            self.writeStreams.splice(0, 1);
            ws.end('', self.finish_callback);
        }

        if (self.finish_need_counts === 0 && callback !== null && callback !== undefined) {
            /* nothing to wait*/
            callback(null);
        }
    };
    this.format = '<{{title}}>:{{file}}:{{line}} {{message}}\n';
    if (typeof options.log_format === 'string' && options.log_format.length > 0) {
        this.format = options.log_format;
    }

    if (typeof options.level === 'string') {
        this.level = options.level;
    }

    if (util.isArray(options.log_files)) {
        add_write_streams(self, options.log_files, false);
    }

    if (util.isArray(options.log_appends)) {
        add_write_streams(self, options.log_appends, true);
    }

    if (typeof options.log_console === 'boolean' && !options.log_console) {
        this.noconsole = true;
    }


    this.innerLogger = tracer.console({
        format: [self.format],
        stackIndex: self.stackindex,
        transport(data) {
            if (!self.noconsole) {
                process.stderr.write(data.output);
            }
            self.writeStreams.forEach(elm => {
                elm.write(data.output);
            });
        },
    });

    tracer.setLevel(this.level);
    return this;
}

module.exports.Init = function(options) {
    const inner_options = options || {};
    let oldinner = null;
    oldinner = _innerLogger;
    _innerLogger = new TraceLog(inner_options);
    return oldinner;
};

module.exports.Set = function(logger) {
    const oldinner = _innerLogger;
    if (logger === null || Array.isArray(logger.writeStreams)) {
        _innerLogger = oldinner;
    }
    return oldinner;
};

const inner_init = function(options) {
    const inner_options = options || {};
    if (_innerLogger) {
        return _innerLogger;
    }
    _innerLogger = new TraceLog(inner_options);
    return null;
};

module.exports.trace = function(...args) {
    const utilstr = format_string(...args);
    inner_init();
    _innerLogger.innerLogger.trace(utilstr);
};

module.exports.debug = function(...args) {
    const utilstr = format_string(...args);
    inner_init();
    _innerLogger.innerLogger.debug(utilstr);
};

module.exports.info = function(...args) {
    const utilstr = format_string(...args);
    inner_init();
    _innerLogger.innerLogger.info(utilstr);
};

module.exports.warn = function(...args) {
    const utilstr = format_string(...args);
    inner_init();
    _innerLogger.innerLogger.warn(utilstr);
};

module.exports.error = function(...args) {
    const utilstr = format_string(...args);
    inner_init();
    _innerLogger.innerLogger.error(utilstr);
};

module.exports.finish = function(callback) {
    if (_innerLogger !== null) {
        _innerLogger.finish(callback);
    } else if (callback !== undefined && callback !== null) {
        callback(null);
    }
    _innerLogger = null;
};

module.exports.init_args = function(parser) {
    const tracelog_options = `
    {
        "+log" : {
            "appends" : [],
            "files" : [],
            "console" : true,
            "format" : "<{{title}}>:{{file}}:{{line}} {{message}}\\n"
        },
        "verbose|v" : "+"
    }
    `;
    parser.load_command_line_string(tracelog_options);
    return parser;
};

const set_attr_self_inner = function(self, args, prefix) {
    let curkey;
    let i;
    let prefixnew;
    const retself = self;

    if (typeof prefix !== 'string' || prefix.length === 0) {
        throw new Error('not valid prefix');
    }

    prefixnew = util.format('%s_', prefix);
    prefixnew = prefixnew.toLowerCase();

    const keys = Object.keys(args);
    for (i = 0; i < keys.length; i += 1) {
        curkey = keys[i];
        if (curkey.substring(0, prefixnew.length).toLowerCase() === prefixnew) {
            retself[curkey] = args[curkey];
        }
    }

    return retself;
};

module.exports.set_args = function(options) {
    const logopt = {};
    if (options.verbose >= 4) {
        logopt.level = 'trace';
    } else if (options.verbose >= 3) {
        logopt.level = 'debug';
    } else if (options.verbose >= 2) {
        logopt.level = 'info';
    } else if (options.verbose >= 1) {
        logopt.level = 'warn';
    } else {
        logopt.level = 'error';
    }

    set_attr_self_inner(logopt, options, 'log');
    /* console.log('logopt (%s)', util.inspect(logopt, {
        showHidden: true,
        depth: null
    }));*/
    module.exports.Init(logopt);
};
