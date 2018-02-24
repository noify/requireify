(function(global) {
    var core = {
        ver: "0.0.1",
        defineName: "define",
        requireName: "require",
        coreName: "requirejs",
        rootUrl: "",
        dict: {}
    }, lastNameDfd = null;
    function each(ary, cb) {
        var i;
        for (i = 0; i < ary.length; i += 1) {
            if (cb.call(ary[i], i, ary[i]) === false) break;
        }
    }
    function makeArray(sender) {
        try {
            return Array.prototype.slice.call(sender);
        } catch (ex) {
            var arr = [], i = 0, len = sender.length;
            for (;i < len; i++) {
                arr.push(sender[i]);
            }
            return arr;
        }
    }
    function resolvePath(from, to) {
        path = from.replace(/[^\/]+$/, "");
        if (to) {
            path += "/" + to;
        } else {
            path = from;
        }
        path = path.replace(/\.js$/, "").replace(/\/+/g, "/").replace(/\/\.\//g, "/").replace(/^\.?\//, "");
        while (~path.indexOf("../")) {
            path = path.replace(/[^\.\/]+\/\.\.\//g, "");
        }
        return path;
    }
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
            fireArgs = makeArray(arguments);
            fireState = 1;
            each(list, function(index, cb) {
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
                var _this = this;
                var pro = {
                    state: _this.state
                };
                each(tuples, function(i, tuple) {
                    pro[tuple[1]] = _this[tuple[1]];
                });
                return pro;
            }
        };
        each(tuples, function(i, tuple) {
            dfd[tuple[0]] = function() {
                if (_state != "pending") return this;
                tuple[2].fire.apply(tuple[2], makeArray(arguments));
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
        promises = makeArray(promises);
        var len = promises.length, resNum = 0, argsArr = new Array(len), dfd = deferred(), pro = dfd.promise();
        if (len === 0) {
            dfd.resolve();
            return pro;
        }
        function addThen() {
            resNum++;
            var args = makeArray(arguments);
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
            var args = makeArray(arguments);
            dfd.reject.apply(dfd, args);
        }
        each(promises, function(index, promise) {
            promise.then(function() {
                args = Array.prototype.slice.apply(arguments);
                args.unshift(index);
                addThen.apply(null, args);
            }).catch(addCatch);
        });
        return pro;
    }
    function requireModule(deps, cb) {
        setTimeout(function() {
            deps = deps.map(function(url) {
                return getModule(resolvePath(core.rootUrl, url));
            });
            all(deps).then(function(args) {
                cb.apply(null, args);
            });
        }, 0);
    }
    function defineModule() {
        var args = makeArray(arguments), name = "", proArr, sender, argsLen = args.length;
        if (argsLen === 1) {
            proArr = [];
            sender = args[0];
        } else if (argsLen === 2) {
            proArr = args[0];
            sender = args[1];
        } else if (argsLen === 3) {
            name = args[0];
            proArr = args[1];
            sender = args[2];
        } else {
            throw Error("参数个数异常");
        }
        var dfdThen = function(_name, lastModule) {
            _name = resolvePath(_name);
            proArr = proArr.map(function(url) {
                url = resolvePath(_name, url);
                return getModule(url);
            });
            all(proArr).then(function(_args) {
                _args = _args || [];
                var result;
                var _type = Object.prototype.toString.call(sender);
                if (_type == "[object Function]") {
                    result = sender.apply(null, _args);
                } else if (_type == "[object Object]") {
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
            var dictName = resolvePath(core.rootUrl, name);
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
    var script = Array.prototype.slice.call(document.getElementsByTagName("script")).slice(-1)[0];
    core.rootUrl = script.getAttribute("data-main");
    addScript(core.rootUrl);
})(this);