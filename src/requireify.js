var requirejs, require, define;
// http://www.ruanyifeng.com/blog/2015/05/require.html
(function (global) {
  var lastNameDfd = null; // 最后一个加载的module的name的 deferred

  // tool
  var _ = {
    /**
     * 获取对象类型
     * 
     * @param {any} sender
     * @returns
     */
    type: function (sender) {
        return sender === null ? (sender + "") :
            (
                Object.prototype.toString.call(sender).toLowerCase().match(/\s([^\]]+)/)[1]
            );
    },
    /**
     * 遍历
     * 
     * @param {any} sender
     * @param {any} callback
     */
    each: function (sender, callback) {
        var i = 0,                      // 循环用变量
            len = sender.length,           // 长度
            arrayLike = this.arrayLike(sender), // 是否属于(类)数组
            result;        // 回调的结果

        if (arrayLike) {
            for (; i < len; i++) {
                result = callback.call(sender[i], i, sender[i]);
                // true 的时候continue 省略
                if (result === false) break;
            }
        } else {
            for (i in sender) {
                result = callback.call(sender[i], i, sender[i]);
                // true 的时候continue 省略
                if (result === false) break;
            }
        }
    },
    /**
     * 检测是否是(伪)数组类型
     * 
     * @param {any} sender
     * @returns
     */
    arrayLike: function (sender) {
        // duck typing ，检测是否属于数组
        return this.type(sender.length) == 'number' && this.type(sender.splice) == 'function';
    },
    /**
     * 将(伪)数组转化成数组
     * 
     * @param {any} sender
     * @returns
     */
    makeArray: function (sender) {
        try {
            return [].slice.call(sender);
        }
        catch (ex) {
            var arr = [],
                i = 0,
                len = sender.length;
            for (; i < len; i++) {
                arr.push(sender[i]);
            }
            return arr;
        }
    },
    /**
     * 规范化路径，这个方法写的比较渣，期待想到更好的方式
     * 
     * @param {any} path
     * @returns 规范化后的路径
     */
    normalizePath: function (path) {
        path = path.replace(/\.js$/, ''); // 去掉末尾的 .js

        path = path.replace(/\/+/g, '/'); // 将多余的 / 转换成一个

        path = path.replace(/\/\.\//g, '/'); //  /./ => /

        path = path.replace(/^\.?\//, '');  // 起始位置的 ./ 和 / 去掉

        while (~path.indexOf('../')) {  // 去掉   ../
            path = path.replace(/[^\.\/]+\/\.\.\//g, '');
        }

        return path;
    },
    /**
     * 合并路径
     * 
     * @param {any} from 起始路径
     * @param {any} to 目标路径
     * @returns 合并后的规范路径
     */
    resolvePath: function (from, to) {
        from = from.replace(/[^\/]+$/, '');
        if (to) {
            from += "/" + to;
        }
        return this.normalizePath(from);
    }
  }

  /**
 * 基础回调模块
 * 
 * @export
 * @returns callbacks
 */
  function callbacks() {
    var list = [],
        _args = (arguments[0] || '').split(' '),           // 参数数组
        fireState = 0,                                     // 触发状态  0-未触发过 1-触发中  2-触发完毕
        stopOnFalse = ~_args.indexOf('stopOnFalse'),       // stopOnFalse - 如果返回false就停止
        once = ~_args.indexOf('once'),                     // once - 只执行一次，即执行完毕就清空
        memory = ~_args.indexOf('memory') ? [] : null,     // memory - 保持状态
        fireArgs = [];                                     // fire 参数

    /**
     * 添加回调函数
     * 
     * @param {any} cb
     * @returns callbacks
     */
    function add(cb) {
        if (memory && fireState == 2) {  // 如果是memory模式，并且已经触发过
            cb.apply(null, fireArgs);
        }

        if (disabled()) return this;      // 如果被disabled

        list.push(cb);
        return this;
    }

    /**
     * 触发
     * 
     * @param {any} 任意参数
     * @returns callbacks
     */
    function fire() {
        if (disabled()) return this; // 如果被禁用

        fireArgs = _.makeArray(arguments); // 保存 fire 参数

        fireState = 1; // 触发中 

        _.each(list, function (index, cb) { // 依次触发回调
            if (cb.apply(null, fireArgs) === false && stopOnFalse) { // stopOnFalse 模式下，遇到false会停止触发
                return false;
            }
        });

        fireState = 2; // 触发结束

        if (once) disable(); // 一次性列表

        return this;
    }

    function disable() {    // 禁止
        list = undefined;
        return this;
    }

    function disabled() {  // 获取是否被禁止
        return !list;
    }

    return {
        add: add,
        fire: fire,
        disable: disable,
        disabled: disabled
    };
  }

  /**
 * deferred 模块
 * 
 * @export
 * @returns deferred
 */
  function deferred() {
    var tuples = [   // 用于存放一系列回调的 tuple 结构
        // 方法名 - 接口名称 - 回调列表 - 最终状态
        ['resolve', 'then', callbacks('once memory'), 'resolved'],
        ['reject', 'catch', callbacks('once memory'), 'rejected']
    ];

    var _state = 'pending';    // 当前状态

    var dfd = {                // 返回的延迟对象
        state: function () {
            return _state;
        },      // 状态
        promise: function () { // promise - 仅提供接口用于注册/订阅
            var self = this;
            var pro = {
                state: self.state
            };
            _.each(tuples, function (i, tuple) { // 订阅接口
                pro[tuple[1]] = self[tuple[1]];
            });
            return pro;
        }
    };

    _.each(tuples, function (i, tuple) {
        dfd[tuple[0]] = function () {       // 触发
            if (_state != "pending") return this;
            tuple[2].fire.apply(tuple[2], _.makeArray(arguments));
            _state = tuple[3];
            return this;
        };
        dfd[tuple[1]] = function (cb) {     // 绑定
            tuple[2].add(cb);
            return this;
        };
    });

    return dfd;
  }

  // all 
  function all(promises) {
    promises = _.makeArray(promises);
    var len = promises.length,    // promise 个数
        resNum = 0,               // resolve 的数量
        argsArr = new Array(len), // 每个reject的参数
        dfd = deferred(),    // 用于当前task控制的deferred
        pro = dfd.promise();      // 用于当前返回的promise

    if (len === 0) {   // 如果是个空数组，直接就返回了
        dfd.resolve();
        return pro;
    }

    function addThen() {   // 检测是否全部完成
        resNum++;
        var args = _.makeArray(arguments);
        var index = args.shift(); // 当前参数在promises中的索引

        if (args.length <= 1) {             // 保存到数组，用户回调
            argsArr[index] = args[0];
        } else {
            argsArr[index] = args;
        }

        if (resNum >= len) {         // 如果所有promise都resolve完毕
            dfd.resolve(argsArr);
        }
    }

    function addCatch() {  // 如果某个promise发生了reject 
        var args = _.makeArray(arguments);
        dfd.reject.apply(dfd, args); // ...
    }
    
    _.each(promises, function (index, promise) {
        promise.then(function () {
            args = Array.prototype.slice.apply(arguments)
            args.unshift(index)
            addThen.apply(null, args); // ...
        }).catch(addCatch);
    });

    return pro;
  }

  /**
   * 默认核心载体
   */
  var core = {
    /**
     *  版本
     */
    ver: "0.0.1",
    /**
     * 模块定义名称
     */
    defineName: "define",
    /**
     * 程序入口函数
     */
    requireName: "require",
    /**
     * 暴露的全局名称，可用于配置
     */
    coreName: "requirejs",
    /**
     * 根目录，入口文件目录
     */
    rootUrl: "",
    /**
     * 依赖模块存储字典
     */
    dict: {  // 模块字典 {key:string,value:promise}

    }
  };

  /**
   * 程序入口， require
   * 
   * @export
   * @param {any} deps 依赖项
   * @param {any} callback 程序入口
   */
  function requireModule(deps, callback) {
    setTimeout(function () {  // 避免阻塞同文件中，使用名称定义的模块
        deps = deps.map(function (url) {
            return getModule(_.resolvePath(core.rootUrl, url))
        })
        all(deps).then(function (args) {
            callback.apply(null, args); // ...
        });
    }, 0);
  }

  /**
  * 模块定义，url,deps,sender
  * 
  * @export
  */
  function defineModule() {
    var args = _.makeArray(arguments);
    var name = "",     // 模块名称
        proArr,   // 模块依赖
        sender; // 模块的主体

    var argsLen = args.length; // 参数的个数，用来重载

    if (argsLen == 1) {  // 重载一下   sender
        proArr = [];
        sender = args[0];
    }
    else if (argsLen == 2) {  // deps,sender
        proArr = args[0];
        sender = args[1];
    }
    else if (argsLen == 3) {  // name,deps,sender
        name = args[0];
        proArr = args[1];
        sender = args[2];
    }
    else {
        throw Error('参数个数异常');
    }

    var dfdThen = function (_name, lastModule) {
        _name = _.normalizePath(_name); // 名称，路径

        proArr = proArr.map(function (url) {  // 各个依赖项 
            url = _.resolvePath(_name, url); // 以当前路径为基准，合并路径
            return getModule(url);
        });

        all(proArr).then(function (_args) {  // 在依赖项加载完毕后，进行模块处理
            _args = _args || [];
            var result; // 最终结果
            var _type = _.type(sender); // 回调模块类型

            if (_type == "function") {
                result = sender.apply(null, _args); // ...
            }
            else if (_type == "object") {
                result = sender;
            }
            else {
                throw Error("参数类型错误");
            }

            lastModule.resolve(result);

        });
    };

    if (argsLen < 3) {  // 如果是匿名模块，使用 onload 来判断js的名称／路径
        lastNameDfd = deferred();  // 先获取当前模块名称

        lastNameDfd.then(dfdThen);
    }
    else {  // 如果是自定义模块名，直接触发,命名模块直接添加
        var lastModule = deferred();
        var dictName = _.resolvePath(core.rootUrl, name);
        core.dict[dictName] = lastModule;

        var namedDfd = deferred().then(dfdThen);

        setTimeout(function () {   // 避免同文件中，多个命名模块注册阻塞，先把名字注册了，具体内容等待一下 event loop 
            namedDfd.resolve(dictName, lastModule);
        }, 0);
    }
  }

  /**
  * 根据 路径/名称 ，加载/获取模块的promise
  * 
  * @param {any} name
  * @returns promise
  */
  function getModule(name) {
    var dict = core.dict;
    if (dict[name]) {
        return dict[name];
    }

    var script = addScript(name);

    var dfd = deferred();
    dict[name] = dfd;

    script.onload = function () {  // 模块加载完毕，立马会触发 load 事件，由此来确定模块所属
        var lastModule = deferred();
        lastNameDfd.resolve(name, lastModule); // 绑定当前模块的名称

        lastModule.then(function (result) {  // 在模块加载完毕之后，触发该模块的 resolve
            dfd.resolve(result);
        });
    };

    return dfd.promise();
  }

  /**
  * 添加 script 标签
  * 
  * @export
  * @param {any} name
  * @returns
  */
  function addScript(name) {
    var script = document.createElement('script');
    script.type = "text/javascript";
    script.async = true;
    script.charset = "utf-8";
    script.src = name + ".js";
    document.head.appendChild(script);
    return script;
  }

  var coreName = core.coreName; // 核心模块名称  
  var requireName = core.requireName; // 程序入口函数名称,require
  var defineName = core.defineName; // 模块定义名称，define

  window[coreName] = core;  // 这里暴露出去，主要用于调试

  window[requireName] = requireModule;

  window[defineName] = defineModule;
  
  var script = [].slice.call(document.getElementsByTagName('script')).slice(-1)[0];
  core.rootUrl = script.getAttribute("data-main");
  
  addScript(core.rootUrl);

}(this));