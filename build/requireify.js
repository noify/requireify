var requirejs, require, define;

(function(global) {
    var lastNameDfd = null;
    var _ = {
        type: function(sender) {
            return sender === null ? sender + "" : Object.prototype.toString.call(sender).toLowerCase().match(/\s([^\]]+)/)[1];
        },
        each: function(sender, callback) {
            var i = 0, len = sender.length, arrayLike = this.arrayLike(sender), result;
            if (arrayLike) {
                for (;i < len; i++) {
                    result = callback.call(sender[i], i, sender[i]);
                    if (result === false) break;
                }
            } else {
                for (i in sender) {
                    result = callback.call(sender[i], i, sender[i]);
                    if (result === false) break;
                }
            }
        },
        arrayLike: function(sender) {
            return this.type(sender.length) == "number" && this.type(sender.splice) == "function";
        },
        makeArray: function(sender) {
            try {
                return [].slice.call(sender);
            } catch (ex) {
                var arr = [], i = 0, len = sender.length;
                for (;i < len; i++) {
                    arr.push(sender[i]);
                }
                return arr;
            }
        },
        normalizePath: function(path) {
            path = path.replace(/\.js$/, "");
            path = path.replace(/\/+/g, "/");
            path = path.replace(/\/\.\//g, "/");
            path = path.replace(/^\.?\//, "");
            while (~path.indexOf("../")) {
                path = path.replace(/[^\.\/]+\/\.\.\//g, "");
            }
            return path;
        },
        resolvePath: function(from, to) {
            from = from.replace(/[^\/]+$/, "");
            if (to) {
                from += "/" + to;
            }
            return this.normalizePath(from);
        }
    };
    function callbacks() {
        var list = [], _args = (arguments[0] || "").split(" "), fireState = 0, stopOnFalse = ~_args.indexOf("stopOnFalse"), once = ~_args.indexOf("once"), memory = ~_args.indexOf("memory") ? [] : null, fireArgs = [];
        function add(cb) {
            if (memory && fireState == 2) {
                cb.apply(null, fireArgs);
            }
            if (disabled()) return this;
            list.push(cb);
            return this;
        }
        function fire() {
            if (disabled()) return this;
            fireArgs = _.makeArray(arguments);
            fireState = 1;
            _.each(list, function(index, cb) {
                if (cb.apply(null, fireArgs) === false && stopOnFalse) {
                    return false;
                }
            });
            fireState = 2;
            if (once) disable();
            return this;
        }
        function disable() {
            list = undefined;
            return this;
        }
        function disabled() {
            return !list;
        }
        return {
            add: add,
            fire: fire,
            disable: disable,
            disabled: disabled
        };
    }
    function deferred() {
        var tuples = [ [ "resolve", "then", callbacks("once memory"), "resolved" ], [ "reject", "catch", callbacks("once memory"), "rejected" ] ];
        var _state = "pending";
        var dfd = {
            state: function() {
                return _state;
            },
            promise: function() {
                var self = this;
                var pro = {
                    state: self.state
                };
                _.each(tuples, function(i, tuple) {
                    pro[tuple[1]] = self[tuple[1]];
                });
                return pro;
            }
        };
        _.each(tuples, function(i, tuple) {
            dfd[tuple[0]] = function() {
                if (_state != "pending") return this;
                tuple[2].fire.apply(tuple[2], _.makeArray(arguments));
                _state = tuple[3];
                return this;
            };
            dfd[tuple[1]] = function(cb) {
                tuple[2].add(cb);
                return this;
            };
        });
        return dfd;
    }
    function all(promises) {
        promises = _.makeArray(promises);
        var len = promises.length, resNum = 0, argsArr = new Array(len), dfd = deferred(), pro = dfd.promise();
        if (len === 0) {
            dfd.resolve();
            return pro;
        }
        function addThen() {
            resNum++;
            var args = _.makeArray(arguments);
            var index = args.shift();
            if (args.length <= 1) {
                argsArr[index] = args[0];
            } else {
                argsArr[index] = args;
            }
            if (resNum >= len) {
                dfd.resolve(argsArr);
            }
        }
        function addCatch() {
            var args = _.makeArray(arguments);
            dfd.reject.apply(dfd, args);
        }
        _.each(promises, function(index, promise) {
            promise.then(function() {
                args = Array.prototype.slice.apply(arguments);
                args.unshift(index);
                addThen.apply(null, args);
            }).catch(addCatch);
        });
        return pro;
    }
    var core = {
        ver: "0.0.1",
        defineName: "define",
        requireName: "require",
        coreName: "requirejs",
        rootUrl: "",
        dict: {}
    };
    function requireModule(deps, callback) {
        setTimeout(function() {
            deps = deps.map(function(url) {
                return getModule(_.resolvePath(core.rootUrl, url));
            });
            all(deps).then(function(args) {
                callback.apply(null, args);
            });
        }, 0);
    }
    function defineModule() {
        var args = _.makeArray(arguments);
        var name = "", proArr, sender;
        var argsLen = args.length;
        if (argsLen == 1) {
            proArr = [];
            sender = args[0];
        } else if (argsLen == 2) {
            proArr = args[0];
            sender = args[1];
        } else if (argsLen == 3) {
            name = args[0];
            proArr = args[1];
            sender = args[2];
        } else {
            throw Error("参数个数异常");
        }
        var dfdThen = function(_name, lastModule) {
            _name = _.normalizePath(_name);
            proArr = proArr.map(function(url) {
                url = _.resolvePath(_name, url);
                return getModule(url);
            });
            all(proArr).then(function(_args) {
                _args = _args || [];
                var result;
                var _type = _.type(sender);
                if (_type == "function") {
                    result = sender.apply(null, _args);
                } else if (_type == "object") {
                    result = sender;
                } else {
                    throw Error("参数类型错误");
                }
                lastModule.resolve(result);
            });
        };
        if (argsLen < 3) {
            lastNameDfd = deferred();
            lastNameDfd.then(dfdThen);
        } else {
            var lastModule = deferred();
            var dictName = _.resolvePath(core.rootUrl, name);
            core.dict[dictName] = lastModule;
            var namedDfd = deferred().then(dfdThen);
            setTimeout(function() {
                namedDfd.resolve(dictName, lastModule);
            }, 0);
        }
    }
    function getModule(name) {
        var dict = core.dict;
        if (dict[name]) {
            return dict[name];
        }
        var script = addScript(name);
        var dfd = deferred();
        dict[name] = dfd;
        script.onload = function() {
            var lastModule = deferred();
            lastNameDfd.resolve(name, lastModule);
            lastModule.then(function(result) {
                dfd.resolve(result);
            });
        };
        return dfd.promise();
    }
    function addScript(name) {
        var script = document.createElement("script");
        script.type = "text/javascript";
        script.async = true;
        script.charset = "utf-8";
        script.src = name + ".js";
        document.head.appendChild(script);
        return script;
    }
    var coreName = core.coreName;
    var requireName = core.requireName;
    var defineName = core.defineName;
    window[coreName] = core;
    window[requireName] = requireModule;
    window[defineName] = defineModule;
    var script = [].slice.call(document.getElementsByTagName("script")).slice(-1)[0];
    core.rootUrl = script.getAttribute("data-main");
    addScript(core.rootUrl);
})(this);