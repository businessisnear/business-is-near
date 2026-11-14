function _applyDecoratedDescriptor(i, e, r, n, l) {
  var a = {};
  return Object.keys(n).forEach(function (i) {
    a[i] = n[i];
  }), a.enumerable = !!a.enumerable, a.configurable = !!a.configurable, ("value" in a || a.initializer) && (a.writable = !0), a = r.slice().reverse().reduce(function (r, n) {
    return n(i, e, r) || r;
  }, a), l && void 0 !== a.initializer && (a.value = a.initializer ? a.initializer.call(l) : void 0, a.initializer = void 0), void 0 === a.initializer ? (Object.defineProperty(i, e, a), null) : a;
}

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;
var freeGlobal$1 = freeGlobal;

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal$1 || freeSelf || Function('return this')();
var root$1 = root;

/** Built-in value references. */
var Symbol = root$1.Symbol;
var Symbol$1 = Symbol;

/** Used for built-in method references. */
var objectProto$c = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty$9 = objectProto$c.hasOwnProperty;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var nativeObjectToString$1 = objectProto$c.toString;

/** Built-in value references. */
var symToStringTag$1 = Symbol$1 ? Symbol$1.toStringTag : undefined;

/**
 * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the raw `toStringTag`.
 */
function getRawTag(value) {
  var isOwn = hasOwnProperty$9.call(value, symToStringTag$1),
    tag = value[symToStringTag$1];
  try {
    value[symToStringTag$1] = undefined;
    var unmasked = true;
  } catch (e) {}
  var result = nativeObjectToString$1.call(value);
  if (unmasked) {
    if (isOwn) {
      value[symToStringTag$1] = tag;
    } else {
      delete value[symToStringTag$1];
    }
  }
  return result;
}

/** Used for built-in method references. */
var objectProto$b = Object.prototype;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var nativeObjectToString = objectProto$b.toString;

/**
 * Converts `value` to a string using `Object.prototype.toString`.
 *
 * @private
 * @param {*} value The value to convert.
 * @returns {string} Returns the converted string.
 */
function objectToString(value) {
  return nativeObjectToString.call(value);
}

/** `Object#toString` result references. */
var nullTag = '[object Null]',
  undefinedTag = '[object Undefined]';

/** Built-in value references. */
var symToStringTag = Symbol$1 ? Symbol$1.toStringTag : undefined;

/**
 * The base implementation of `getTag` without fallbacks for buggy environments.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the `toStringTag`.
 */
function baseGetTag(value) {
  if (value == null) {
    return value === undefined ? undefinedTag : nullTag;
  }
  return symToStringTag && symToStringTag in Object(value) ? getRawTag(value) : objectToString(value);
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return value != null && typeof value == 'object';
}

/**
 * Checks if `value` is classified as an `Array` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
 * @example
 *
 * _.isArray([1, 2, 3]);
 * // => true
 *
 * _.isArray(document.body.children);
 * // => false
 *
 * _.isArray('abc');
 * // => false
 *
 * _.isArray(_.noop);
 * // => false
 */
var isArray = Array.isArray;
var isArray$1 = isArray;

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return value != null && (type == 'object' || type == 'function');
}

/** `Object#toString` result references. */
var asyncTag = '[object AsyncFunction]',
  funcTag$2 = '[object Function]',
  genTag$1 = '[object GeneratorFunction]',
  proxyTag = '[object Proxy]';

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  if (!isObject(value)) {
    return false;
  }
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 9 which returns 'object' for typed arrays and other constructors.
  var tag = baseGetTag(value);
  return tag == funcTag$2 || tag == genTag$1 || tag == asyncTag || tag == proxyTag;
}

/** Used to detect overreaching core-js shims. */
var coreJsData = root$1['__core-js_shared__'];
var coreJsData$1 = coreJsData;

/** Used to detect methods masquerading as native. */
var maskSrcKey = function () {
  var uid = /[^.]+$/.exec(coreJsData$1 && coreJsData$1.keys && coreJsData$1.keys.IE_PROTO || '');
  return uid ? 'Symbol(src)_1.' + uid : '';
}();

/**
 * Checks if `func` has its source masked.
 *
 * @private
 * @param {Function} func The function to check.
 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
 */
function isMasked(func) {
  return !!maskSrcKey && maskSrcKey in func;
}

/** Used for built-in method references. */
var funcProto$1 = Function.prototype;

/** Used to resolve the decompiled source of functions. */
var funcToString$1 = funcProto$1.toString;

/**
 * Converts `func` to its source code.
 *
 * @private
 * @param {Function} func The function to convert.
 * @returns {string} Returns the source code.
 */
function toSource(func) {
  if (func != null) {
    try {
      return funcToString$1.call(func);
    } catch (e) {}
    try {
      return func + '';
    } catch (e) {}
  }
  return '';
}

/**
 * Used to match `RegExp`
 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
 */
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

/** Used to detect host constructors (Safari). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/** Used for built-in method references. */
var funcProto = Function.prototype,
  objectProto$a = Object.prototype;

/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;

/** Used to check objects for own properties. */
var hasOwnProperty$8 = objectProto$a.hasOwnProperty;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' + funcToString.call(hasOwnProperty$8).replace(reRegExpChar, '\\$&').replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$');

/**
 * The base implementation of `_.isNative` without bad shim checks.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function,
 *  else `false`.
 */
function baseIsNative(value) {
  if (!isObject(value) || isMasked(value)) {
    return false;
  }
  var pattern = isFunction(value) ? reIsNative : reIsHostCtor;
  return pattern.test(toSource(value));
}

/**
 * Gets the value at `key` of `object`.
 *
 * @private
 * @param {Object} [object] The object to query.
 * @param {string} key The key of the property to get.
 * @returns {*} Returns the property value.
 */
function getValue(object, key) {
  return object == null ? undefined : object[key];
}

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = getValue(object, key);
  return baseIsNative(value) ? value : undefined;
}

/* Built-in method references that are verified to be native. */
var WeakMap = getNative(root$1, 'WeakMap');
var WeakMap$1 = WeakMap;

/** Built-in value references. */
var objectCreate = Object.create;

/**
 * The base implementation of `_.create` without support for assigning
 * properties to the created object.
 *
 * @private
 * @param {Object} proto The object to inherit from.
 * @returns {Object} Returns the new object.
 */
var baseCreate = function () {
  function object() {}
  return function (proto) {
    if (!isObject(proto)) {
      return {};
    }
    if (objectCreate) {
      return objectCreate(proto);
    }
    object.prototype = proto;
    var result = new object();
    object.prototype = undefined;
    return result;
  };
}();
var baseCreate$1 = baseCreate;

/**
 * Copies the values of `source` to `array`.
 *
 * @private
 * @param {Array} source The array to copy values from.
 * @param {Array} [array=[]] The array to copy values to.
 * @returns {Array} Returns `array`.
 */
function copyArray(source, array) {
  var index = -1,
    length = source.length;
  array || (array = Array(length));
  while (++index < length) {
    array[index] = source[index];
  }
  return array;
}

var defineProperty = function () {
  try {
    var func = getNative(Object, 'defineProperty');
    func({}, '', {});
    return func;
  } catch (e) {}
}();
var defineProperty$1 = defineProperty;

/**
 * A specialized version of `_.forEach` for arrays without support for
 * iteratee shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns `array`.
 */
function arrayEach(array, iteratee) {
  var index = -1,
    length = array == null ? 0 : array.length;
  while (++index < length) {
    if (iteratee(array[index], index, array) === false) {
      break;
    }
  }
  return array;
}

/** Used as references for various `Number` constants. */
var MAX_SAFE_INTEGER$1 = 9007199254740991;

/** Used to detect unsigned integer values. */
var reIsUint = /^(?:0|[1-9]\d*)$/;

/**
 * Checks if `value` is a valid array-like index.
 *
 * @private
 * @param {*} value The value to check.
 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
 */
function isIndex(value, length) {
  var type = typeof value;
  length = length == null ? MAX_SAFE_INTEGER$1 : length;
  return !!length && (type == 'number' || type != 'symbol' && reIsUint.test(value)) && value > -1 && value % 1 == 0 && value < length;
}

/**
 * The base implementation of `assignValue` and `assignMergeValue` without
 * value checks.
 *
 * @private
 * @param {Object} object The object to modify.
 * @param {string} key The key of the property to assign.
 * @param {*} value The value to assign.
 */
function baseAssignValue(object, key, value) {
  if (key == '__proto__' && defineProperty$1) {
    defineProperty$1(object, key, {
      'configurable': true,
      'enumerable': true,
      'value': value,
      'writable': true
    });
  } else {
    object[key] = value;
  }
}

/**
 * Performs a
 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * comparison between two values to determine if they are equivalent.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to compare.
 * @param {*} other The other value to compare.
 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
 * @example
 *
 * var object = { 'a': 1 };
 * var other = { 'a': 1 };
 *
 * _.eq(object, object);
 * // => true
 *
 * _.eq(object, other);
 * // => false
 *
 * _.eq('a', 'a');
 * // => true
 *
 * _.eq('a', Object('a'));
 * // => false
 *
 * _.eq(NaN, NaN);
 * // => true
 */
function eq(value, other) {
  return value === other || value !== value && other !== other;
}

/** Used for built-in method references. */
var objectProto$9 = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty$7 = objectProto$9.hasOwnProperty;

/**
 * Assigns `value` to `key` of `object` if the existing value is not equivalent
 * using [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
 * for equality comparisons.
 *
 * @private
 * @param {Object} object The object to modify.
 * @param {string} key The key of the property to assign.
 * @param {*} value The value to assign.
 */
function assignValue(object, key, value) {
  var objValue = object[key];
  if (!(hasOwnProperty$7.call(object, key) && eq(objValue, value)) || value === undefined && !(key in object)) {
    baseAssignValue(object, key, value);
  }
}

/**
 * Copies properties of `source` to `object`.
 *
 * @private
 * @param {Object} source The object to copy properties from.
 * @param {Array} props The property identifiers to copy.
 * @param {Object} [object={}] The object to copy properties to.
 * @param {Function} [customizer] The function to customize copied values.
 * @returns {Object} Returns `object`.
 */
function copyObject(source, props, object, customizer) {
  var isNew = !object;
  object || (object = {});
  var index = -1,
    length = props.length;
  while (++index < length) {
    var key = props[index];
    var newValue = customizer ? customizer(object[key], source[key], key, object, source) : undefined;
    if (newValue === undefined) {
      newValue = source[key];
    }
    if (isNew) {
      baseAssignValue(object, key, newValue);
    } else {
      assignValue(object, key, newValue);
    }
  }
  return object;
}

/** Used as references for various `Number` constants. */
var MAX_SAFE_INTEGER = 9007199254740991;

/**
 * Checks if `value` is a valid array-like length.
 *
 * **Note:** This method is loosely based on
 * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
 * @example
 *
 * _.isLength(3);
 * // => true
 *
 * _.isLength(Number.MIN_VALUE);
 * // => false
 *
 * _.isLength(Infinity);
 * // => false
 *
 * _.isLength('3');
 * // => false
 */
function isLength(value) {
  return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
}

/**
 * Checks if `value` is array-like. A value is considered array-like if it's
 * not a function and has a `value.length` that's an integer greater than or
 * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
 * @example
 *
 * _.isArrayLike([1, 2, 3]);
 * // => true
 *
 * _.isArrayLike(document.body.children);
 * // => true
 *
 * _.isArrayLike('abc');
 * // => true
 *
 * _.isArrayLike(_.noop);
 * // => false
 */
function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

/** Used for built-in method references. */
var objectProto$8 = Object.prototype;

/**
 * Checks if `value` is likely a prototype object.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
 */
function isPrototype(value) {
  var Ctor = value && value.constructor,
    proto = typeof Ctor == 'function' && Ctor.prototype || objectProto$8;
  return value === proto;
}

/**
 * The base implementation of `_.times` without support for iteratee shorthands
 * or max array length checks.
 *
 * @private
 * @param {number} n The number of times to invoke `iteratee`.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns the array of results.
 */
function baseTimes(n, iteratee) {
  var index = -1,
    result = Array(n);
  while (++index < n) {
    result[index] = iteratee(index);
  }
  return result;
}

/** `Object#toString` result references. */
var argsTag$2 = '[object Arguments]';

/**
 * The base implementation of `_.isArguments`.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
 */
function baseIsArguments(value) {
  return isObjectLike(value) && baseGetTag(value) == argsTag$2;
}

/** Used for built-in method references. */
var objectProto$7 = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty$6 = objectProto$7.hasOwnProperty;

/** Built-in value references. */
var propertyIsEnumerable$1 = objectProto$7.propertyIsEnumerable;

/**
 * Checks if `value` is likely an `arguments` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an `arguments` object,
 *  else `false`.
 * @example
 *
 * _.isArguments(function() { return arguments; }());
 * // => true
 *
 * _.isArguments([1, 2, 3]);
 * // => false
 */
var isArguments = baseIsArguments(function () {
  return arguments;
}()) ? baseIsArguments : function (value) {
  return isObjectLike(value) && hasOwnProperty$6.call(value, 'callee') && !propertyIsEnumerable$1.call(value, 'callee');
};
var isArguments$1 = isArguments;

/**
 * This method returns `false`.
 *
 * @static
 * @memberOf _
 * @since 4.13.0
 * @category Util
 * @returns {boolean} Returns `false`.
 * @example
 *
 * _.times(2, _.stubFalse);
 * // => [false, false]
 */
function stubFalse() {
  return false;
}

/** Detect free variable `exports`. */
var freeExports$2 = typeof exports == 'object' && exports && !exports.nodeType && exports;

/** Detect free variable `module`. */
var freeModule$2 = freeExports$2 && typeof module == 'object' && module && !module.nodeType && module;

/** Detect the popular CommonJS extension `module.exports`. */
var moduleExports$2 = freeModule$2 && freeModule$2.exports === freeExports$2;

/** Built-in value references. */
var Buffer$1 = moduleExports$2 ? root$1.Buffer : undefined;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeIsBuffer = Buffer$1 ? Buffer$1.isBuffer : undefined;

/**
 * Checks if `value` is a buffer.
 *
 * @static
 * @memberOf _
 * @since 4.3.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a buffer, else `false`.
 * @example
 *
 * _.isBuffer(new Buffer(2));
 * // => true
 *
 * _.isBuffer(new Uint8Array(2));
 * // => false
 */
var isBuffer = nativeIsBuffer || stubFalse;
var isBuffer$1 = isBuffer;

/** `Object#toString` result references. */
var argsTag$1 = '[object Arguments]',
  arrayTag$1 = '[object Array]',
  boolTag$2 = '[object Boolean]',
  dateTag$2 = '[object Date]',
  errorTag$1 = '[object Error]',
  funcTag$1 = '[object Function]',
  mapTag$4 = '[object Map]',
  numberTag$2 = '[object Number]',
  objectTag$2 = '[object Object]',
  regexpTag$2 = '[object RegExp]',
  setTag$4 = '[object Set]',
  stringTag$2 = '[object String]',
  weakMapTag$2 = '[object WeakMap]';
var arrayBufferTag$2 = '[object ArrayBuffer]',
  dataViewTag$3 = '[object DataView]',
  float32Tag$2 = '[object Float32Array]',
  float64Tag$2 = '[object Float64Array]',
  int8Tag$2 = '[object Int8Array]',
  int16Tag$2 = '[object Int16Array]',
  int32Tag$2 = '[object Int32Array]',
  uint8Tag$2 = '[object Uint8Array]',
  uint8ClampedTag$2 = '[object Uint8ClampedArray]',
  uint16Tag$2 = '[object Uint16Array]',
  uint32Tag$2 = '[object Uint32Array]';

/** Used to identify `toStringTag` values of typed arrays. */
var typedArrayTags = {};
typedArrayTags[float32Tag$2] = typedArrayTags[float64Tag$2] = typedArrayTags[int8Tag$2] = typedArrayTags[int16Tag$2] = typedArrayTags[int32Tag$2] = typedArrayTags[uint8Tag$2] = typedArrayTags[uint8ClampedTag$2] = typedArrayTags[uint16Tag$2] = typedArrayTags[uint32Tag$2] = true;
typedArrayTags[argsTag$1] = typedArrayTags[arrayTag$1] = typedArrayTags[arrayBufferTag$2] = typedArrayTags[boolTag$2] = typedArrayTags[dataViewTag$3] = typedArrayTags[dateTag$2] = typedArrayTags[errorTag$1] = typedArrayTags[funcTag$1] = typedArrayTags[mapTag$4] = typedArrayTags[numberTag$2] = typedArrayTags[objectTag$2] = typedArrayTags[regexpTag$2] = typedArrayTags[setTag$4] = typedArrayTags[stringTag$2] = typedArrayTags[weakMapTag$2] = false;

/**
 * The base implementation of `_.isTypedArray` without Node.js optimizations.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
 */
function baseIsTypedArray(value) {
  return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[baseGetTag(value)];
}

/**
 * The base implementation of `_.unary` without support for storing metadata.
 *
 * @private
 * @param {Function} func The function to cap arguments for.
 * @returns {Function} Returns the new capped function.
 */
function baseUnary(func) {
  return function (value) {
    return func(value);
  };
}

/** Detect free variable `exports`. */
var freeExports$1 = typeof exports == 'object' && exports && !exports.nodeType && exports;

/** Detect free variable `module`. */
var freeModule$1 = freeExports$1 && typeof module == 'object' && module && !module.nodeType && module;

/** Detect the popular CommonJS extension `module.exports`. */
var moduleExports$1 = freeModule$1 && freeModule$1.exports === freeExports$1;

/** Detect free variable `process` from Node.js. */
var freeProcess = moduleExports$1 && freeGlobal$1.process;

/** Used to access faster Node.js helpers. */
var nodeUtil = function () {
  try {
    // Use `util.types` for Node.js 10+.
    var types = freeModule$1 && freeModule$1.require && freeModule$1.require('util').types;
    if (types) {
      return types;
    }

    // Legacy `process.binding('util')` for Node.js < 10.
    return freeProcess && freeProcess.binding && freeProcess.binding('util');
  } catch (e) {}
}();
var nodeUtil$1 = nodeUtil;

/* Node.js helper references. */
var nodeIsTypedArray = nodeUtil$1 && nodeUtil$1.isTypedArray;

/**
 * Checks if `value` is classified as a typed array.
 *
 * @static
 * @memberOf _
 * @since 3.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
 * @example
 *
 * _.isTypedArray(new Uint8Array);
 * // => true
 *
 * _.isTypedArray([]);
 * // => false
 */
var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;
var isTypedArray$1 = isTypedArray;

/** Used for built-in method references. */
var objectProto$6 = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty$5 = objectProto$6.hasOwnProperty;

/**
 * Creates an array of the enumerable property names of the array-like `value`.
 *
 * @private
 * @param {*} value The value to query.
 * @param {boolean} inherited Specify returning inherited property names.
 * @returns {Array} Returns the array of property names.
 */
function arrayLikeKeys(value, inherited) {
  var isArr = isArray$1(value),
    isArg = !isArr && isArguments$1(value),
    isBuff = !isArr && !isArg && isBuffer$1(value),
    isType = !isArr && !isArg && !isBuff && isTypedArray$1(value),
    skipIndexes = isArr || isArg || isBuff || isType,
    result = skipIndexes ? baseTimes(value.length, String) : [],
    length = result.length;
  for (var key in value) {
    if ((inherited || hasOwnProperty$5.call(value, key)) && !(skipIndexes && (
    // Safari 9 has enumerable `arguments.length` in strict mode.
    key == 'length' ||
    // Node.js 0.10 has enumerable non-index properties on buffers.
    isBuff && (key == 'offset' || key == 'parent') ||
    // PhantomJS 2 has enumerable non-index properties on typed arrays.
    isType && (key == 'buffer' || key == 'byteLength' || key == 'byteOffset') ||
    // Skip index properties.
    isIndex(key, length)))) {
      result.push(key);
    }
  }
  return result;
}

/**
 * Creates a unary function that invokes `func` with its argument transformed.
 *
 * @private
 * @param {Function} func The function to wrap.
 * @param {Function} transform The argument transform.
 * @returns {Function} Returns the new function.
 */
function overArg(func, transform) {
  return function (arg) {
    return func(transform(arg));
  };
}

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeKeys = overArg(Object.keys, Object);
var nativeKeys$1 = nativeKeys;

/** Used for built-in method references. */
var objectProto$5 = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty$4 = objectProto$5.hasOwnProperty;

/**
 * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function baseKeys(object) {
  if (!isPrototype(object)) {
    return nativeKeys$1(object);
  }
  var result = [];
  for (var key in Object(object)) {
    if (hasOwnProperty$4.call(object, key) && key != 'constructor') {
      result.push(key);
    }
  }
  return result;
}

/**
 * Creates an array of the own enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects. See the
 * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
 * for more details.
 *
 * @static
 * @since 0.1.0
 * @memberOf _
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keys(new Foo);
 * // => ['a', 'b'] (iteration order is not guaranteed)
 *
 * _.keys('hi');
 * // => ['0', '1']
 */
function keys(object) {
  return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
}

/**
 * This function is like
 * [`Object.keys`](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
 * except that it includes inherited enumerable properties.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function nativeKeysIn(object) {
  var result = [];
  if (object != null) {
    for (var key in Object(object)) {
      result.push(key);
    }
  }
  return result;
}

/** Used for built-in method references. */
var objectProto$4 = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty$3 = objectProto$4.hasOwnProperty;

/**
 * The base implementation of `_.keysIn` which doesn't treat sparse arrays as dense.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 */
function baseKeysIn(object) {
  if (!isObject(object)) {
    return nativeKeysIn(object);
  }
  var isProto = isPrototype(object),
    result = [];
  for (var key in object) {
    if (!(key == 'constructor' && (isProto || !hasOwnProperty$3.call(object, key)))) {
      result.push(key);
    }
  }
  return result;
}

/**
 * Creates an array of the own and inherited enumerable property names of `object`.
 *
 * **Note:** Non-object values are coerced to objects.
 *
 * @static
 * @memberOf _
 * @since 3.0.0
 * @category Object
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names.
 * @example
 *
 * function Foo() {
 *   this.a = 1;
 *   this.b = 2;
 * }
 *
 * Foo.prototype.c = 3;
 *
 * _.keysIn(new Foo);
 * // => ['a', 'b', 'c'] (iteration order is not guaranteed)
 */
function keysIn(object) {
  return isArrayLike(object) ? arrayLikeKeys(object, true) : baseKeysIn(object);
}

/* Built-in method references that are verified to be native. */
var nativeCreate = getNative(Object, 'create');
var nativeCreate$1 = nativeCreate;

/**
 * Removes all key-value entries from the hash.
 *
 * @private
 * @name clear
 * @memberOf Hash
 */
function hashClear() {
  this.__data__ = nativeCreate$1 ? nativeCreate$1(null) : {};
  this.size = 0;
}

/**
 * Removes `key` and its value from the hash.
 *
 * @private
 * @name delete
 * @memberOf Hash
 * @param {Object} hash The hash to modify.
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function hashDelete(key) {
  var result = this.has(key) && delete this.__data__[key];
  this.size -= result ? 1 : 0;
  return result;
}

/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED$1 = '__lodash_hash_undefined__';

/** Used for built-in method references. */
var objectProto$3 = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty$2 = objectProto$3.hasOwnProperty;

/**
 * Gets the hash value for `key`.
 *
 * @private
 * @name get
 * @memberOf Hash
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function hashGet(key) {
  var data = this.__data__;
  if (nativeCreate$1) {
    var result = data[key];
    return result === HASH_UNDEFINED$1 ? undefined : result;
  }
  return hasOwnProperty$2.call(data, key) ? data[key] : undefined;
}

/** Used for built-in method references. */
var objectProto$2 = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty$1 = objectProto$2.hasOwnProperty;

/**
 * Checks if a hash value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf Hash
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function hashHas(key) {
  var data = this.__data__;
  return nativeCreate$1 ? data[key] !== undefined : hasOwnProperty$1.call(data, key);
}

/** Used to stand-in for `undefined` hash values. */
var HASH_UNDEFINED = '__lodash_hash_undefined__';

/**
 * Sets the hash `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf Hash
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the hash instance.
 */
function hashSet(key, value) {
  var data = this.__data__;
  this.size += this.has(key) ? 0 : 1;
  data[key] = nativeCreate$1 && value === undefined ? HASH_UNDEFINED : value;
  return this;
}

/**
 * Creates a hash object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function Hash(entries) {
  var index = -1,
    length = entries == null ? 0 : entries.length;
  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

// Add methods to `Hash`.
Hash.prototype.clear = hashClear;
Hash.prototype['delete'] = hashDelete;
Hash.prototype.get = hashGet;
Hash.prototype.has = hashHas;
Hash.prototype.set = hashSet;

/**
 * Removes all key-value entries from the list cache.
 *
 * @private
 * @name clear
 * @memberOf ListCache
 */
function listCacheClear() {
  this.__data__ = [];
  this.size = 0;
}

/**
 * Gets the index at which the `key` is found in `array` of key-value pairs.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {*} key The key to search for.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function assocIndexOf(array, key) {
  var length = array.length;
  while (length--) {
    if (eq(array[length][0], key)) {
      return length;
    }
  }
  return -1;
}

/** Used for built-in method references. */
var arrayProto = Array.prototype;

/** Built-in value references. */
var splice = arrayProto.splice;

/**
 * Removes `key` and its value from the list cache.
 *
 * @private
 * @name delete
 * @memberOf ListCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function listCacheDelete(key) {
  var data = this.__data__,
    index = assocIndexOf(data, key);
  if (index < 0) {
    return false;
  }
  var lastIndex = data.length - 1;
  if (index == lastIndex) {
    data.pop();
  } else {
    splice.call(data, index, 1);
  }
  --this.size;
  return true;
}

/**
 * Gets the list cache value for `key`.
 *
 * @private
 * @name get
 * @memberOf ListCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function listCacheGet(key) {
  var data = this.__data__,
    index = assocIndexOf(data, key);
  return index < 0 ? undefined : data[index][1];
}

/**
 * Checks if a list cache value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf ListCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function listCacheHas(key) {
  return assocIndexOf(this.__data__, key) > -1;
}

/**
 * Sets the list cache `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf ListCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the list cache instance.
 */
function listCacheSet(key, value) {
  var data = this.__data__,
    index = assocIndexOf(data, key);
  if (index < 0) {
    ++this.size;
    data.push([key, value]);
  } else {
    data[index][1] = value;
  }
  return this;
}

/**
 * Creates an list cache object.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function ListCache(entries) {
  var index = -1,
    length = entries == null ? 0 : entries.length;
  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

// Add methods to `ListCache`.
ListCache.prototype.clear = listCacheClear;
ListCache.prototype['delete'] = listCacheDelete;
ListCache.prototype.get = listCacheGet;
ListCache.prototype.has = listCacheHas;
ListCache.prototype.set = listCacheSet;

/* Built-in method references that are verified to be native. */
var Map = getNative(root$1, 'Map');
var Map$1 = Map;

/**
 * Removes all key-value entries from the map.
 *
 * @private
 * @name clear
 * @memberOf MapCache
 */
function mapCacheClear() {
  this.size = 0;
  this.__data__ = {
    'hash': new Hash(),
    'map': new (Map$1 || ListCache)(),
    'string': new Hash()
  };
}

/**
 * Checks if `value` is suitable for use as unique object key.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
 */
function isKeyable(value) {
  var type = typeof value;
  return type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean' ? value !== '__proto__' : value === null;
}

/**
 * Gets the data for `map`.
 *
 * @private
 * @param {Object} map The map to query.
 * @param {string} key The reference key.
 * @returns {*} Returns the map data.
 */
function getMapData(map, key) {
  var data = map.__data__;
  return isKeyable(key) ? data[typeof key == 'string' ? 'string' : 'hash'] : data.map;
}

/**
 * Removes `key` and its value from the map.
 *
 * @private
 * @name delete
 * @memberOf MapCache
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function mapCacheDelete(key) {
  var result = getMapData(this, key)['delete'](key);
  this.size -= result ? 1 : 0;
  return result;
}

/**
 * Gets the map value for `key`.
 *
 * @private
 * @name get
 * @memberOf MapCache
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function mapCacheGet(key) {
  return getMapData(this, key).get(key);
}

/**
 * Checks if a map value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf MapCache
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function mapCacheHas(key) {
  return getMapData(this, key).has(key);
}

/**
 * Sets the map `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf MapCache
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the map cache instance.
 */
function mapCacheSet(key, value) {
  var data = getMapData(this, key),
    size = data.size;
  data.set(key, value);
  this.size += data.size == size ? 0 : 1;
  return this;
}

/**
 * Creates a map cache object to store key-value pairs.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function MapCache(entries) {
  var index = -1,
    length = entries == null ? 0 : entries.length;
  this.clear();
  while (++index < length) {
    var entry = entries[index];
    this.set(entry[0], entry[1]);
  }
}

// Add methods to `MapCache`.
MapCache.prototype.clear = mapCacheClear;
MapCache.prototype['delete'] = mapCacheDelete;
MapCache.prototype.get = mapCacheGet;
MapCache.prototype.has = mapCacheHas;
MapCache.prototype.set = mapCacheSet;

/**
 * Appends the elements of `values` to `array`.
 *
 * @private
 * @param {Array} array The array to modify.
 * @param {Array} values The values to append.
 * @returns {Array} Returns `array`.
 */
function arrayPush(array, values) {
  var index = -1,
    length = values.length,
    offset = array.length;
  while (++index < length) {
    array[offset + index] = values[index];
  }
  return array;
}

/** Built-in value references. */
var getPrototype = overArg(Object.getPrototypeOf, Object);
var getPrototype$1 = getPrototype;

/**
 * Removes all key-value entries from the stack.
 *
 * @private
 * @name clear
 * @memberOf Stack
 */
function stackClear() {
  this.__data__ = new ListCache();
  this.size = 0;
}

/**
 * Removes `key` and its value from the stack.
 *
 * @private
 * @name delete
 * @memberOf Stack
 * @param {string} key The key of the value to remove.
 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
 */
function stackDelete(key) {
  var data = this.__data__,
    result = data['delete'](key);
  this.size = data.size;
  return result;
}

/**
 * Gets the stack value for `key`.
 *
 * @private
 * @name get
 * @memberOf Stack
 * @param {string} key The key of the value to get.
 * @returns {*} Returns the entry value.
 */
function stackGet(key) {
  return this.__data__.get(key);
}

/**
 * Checks if a stack value for `key` exists.
 *
 * @private
 * @name has
 * @memberOf Stack
 * @param {string} key The key of the entry to check.
 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
 */
function stackHas(key) {
  return this.__data__.has(key);
}

/** Used as the size to enable large array optimizations. */
var LARGE_ARRAY_SIZE = 200;

/**
 * Sets the stack `key` to `value`.
 *
 * @private
 * @name set
 * @memberOf Stack
 * @param {string} key The key of the value to set.
 * @param {*} value The value to set.
 * @returns {Object} Returns the stack cache instance.
 */
function stackSet(key, value) {
  var data = this.__data__;
  if (data instanceof ListCache) {
    var pairs = data.__data__;
    if (!Map$1 || pairs.length < LARGE_ARRAY_SIZE - 1) {
      pairs.push([key, value]);
      this.size = ++data.size;
      return this;
    }
    data = this.__data__ = new MapCache(pairs);
  }
  data.set(key, value);
  this.size = data.size;
  return this;
}

/**
 * Creates a stack cache object to store key-value pairs.
 *
 * @private
 * @constructor
 * @param {Array} [entries] The key-value pairs to cache.
 */
function Stack(entries) {
  var data = this.__data__ = new ListCache(entries);
  this.size = data.size;
}

// Add methods to `Stack`.
Stack.prototype.clear = stackClear;
Stack.prototype['delete'] = stackDelete;
Stack.prototype.get = stackGet;
Stack.prototype.has = stackHas;
Stack.prototype.set = stackSet;

/**
 * The base implementation of `_.assign` without support for multiple sources
 * or `customizer` functions.
 *
 * @private
 * @param {Object} object The destination object.
 * @param {Object} source The source object.
 * @returns {Object} Returns `object`.
 */
function baseAssign(object, source) {
  return object && copyObject(source, keys(source), object);
}

/**
 * The base implementation of `_.assignIn` without support for multiple sources
 * or `customizer` functions.
 *
 * @private
 * @param {Object} object The destination object.
 * @param {Object} source The source object.
 * @returns {Object} Returns `object`.
 */
function baseAssignIn(object, source) {
  return object && copyObject(source, keysIn(source), object);
}

/** Detect free variable `exports`. */
var freeExports = typeof exports == 'object' && exports && !exports.nodeType && exports;

/** Detect free variable `module`. */
var freeModule = freeExports && typeof module == 'object' && module && !module.nodeType && module;

/** Detect the popular CommonJS extension `module.exports`. */
var moduleExports = freeModule && freeModule.exports === freeExports;

/** Built-in value references. */
var Buffer = moduleExports ? root$1.Buffer : undefined,
  allocUnsafe = Buffer ? Buffer.allocUnsafe : undefined;

/**
 * Creates a clone of  `buffer`.
 *
 * @private
 * @param {Buffer} buffer The buffer to clone.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Buffer} Returns the cloned buffer.
 */
function cloneBuffer(buffer, isDeep) {
  if (isDeep) {
    return buffer.slice();
  }
  var length = buffer.length,
    result = allocUnsafe ? allocUnsafe(length) : new buffer.constructor(length);
  buffer.copy(result);
  return result;
}

/**
 * A specialized version of `_.filter` for arrays without support for
 * iteratee shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} predicate The function invoked per iteration.
 * @returns {Array} Returns the new filtered array.
 */
function arrayFilter(array, predicate) {
  var index = -1,
    length = array == null ? 0 : array.length,
    resIndex = 0,
    result = [];
  while (++index < length) {
    var value = array[index];
    if (predicate(value, index, array)) {
      result[resIndex++] = value;
    }
  }
  return result;
}

/**
 * This method returns a new empty array.
 *
 * @static
 * @memberOf _
 * @since 4.13.0
 * @category Util
 * @returns {Array} Returns the new empty array.
 * @example
 *
 * var arrays = _.times(2, _.stubArray);
 *
 * console.log(arrays);
 * // => [[], []]
 *
 * console.log(arrays[0] === arrays[1]);
 * // => false
 */
function stubArray() {
  return [];
}

/** Used for built-in method references. */
var objectProto$1 = Object.prototype;

/** Built-in value references. */
var propertyIsEnumerable = objectProto$1.propertyIsEnumerable;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeGetSymbols$1 = Object.getOwnPropertySymbols;

/**
 * Creates an array of the own enumerable symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of symbols.
 */
var getSymbols = !nativeGetSymbols$1 ? stubArray : function (object) {
  if (object == null) {
    return [];
  }
  object = Object(object);
  return arrayFilter(nativeGetSymbols$1(object), function (symbol) {
    return propertyIsEnumerable.call(object, symbol);
  });
};
var getSymbols$1 = getSymbols;

/**
 * Copies own symbols of `source` to `object`.
 *
 * @private
 * @param {Object} source The object to copy symbols from.
 * @param {Object} [object={}] The object to copy symbols to.
 * @returns {Object} Returns `object`.
 */
function copySymbols(source, object) {
  return copyObject(source, getSymbols$1(source), object);
}

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeGetSymbols = Object.getOwnPropertySymbols;

/**
 * Creates an array of the own and inherited enumerable symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of symbols.
 */
var getSymbolsIn = !nativeGetSymbols ? stubArray : function (object) {
  var result = [];
  while (object) {
    arrayPush(result, getSymbols$1(object));
    object = getPrototype$1(object);
  }
  return result;
};
var getSymbolsIn$1 = getSymbolsIn;

/**
 * Copies own and inherited symbols of `source` to `object`.
 *
 * @private
 * @param {Object} source The object to copy symbols from.
 * @param {Object} [object={}] The object to copy symbols to.
 * @returns {Object} Returns `object`.
 */
function copySymbolsIn(source, object) {
  return copyObject(source, getSymbolsIn$1(source), object);
}

/**
 * The base implementation of `getAllKeys` and `getAllKeysIn` which uses
 * `keysFunc` and `symbolsFunc` to get the enumerable property names and
 * symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {Function} keysFunc The function to get the keys of `object`.
 * @param {Function} symbolsFunc The function to get the symbols of `object`.
 * @returns {Array} Returns the array of property names and symbols.
 */
function baseGetAllKeys(object, keysFunc, symbolsFunc) {
  var result = keysFunc(object);
  return isArray$1(object) ? result : arrayPush(result, symbolsFunc(object));
}

/**
 * Creates an array of own enumerable property names and symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names and symbols.
 */
function getAllKeys(object) {
  return baseGetAllKeys(object, keys, getSymbols$1);
}

/**
 * Creates an array of own and inherited enumerable property names and
 * symbols of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @returns {Array} Returns the array of property names and symbols.
 */
function getAllKeysIn(object) {
  return baseGetAllKeys(object, keysIn, getSymbolsIn$1);
}

/* Built-in method references that are verified to be native. */
var DataView = getNative(root$1, 'DataView');
var DataView$1 = DataView;

/* Built-in method references that are verified to be native. */
var Promise$1 = getNative(root$1, 'Promise');
var Promise$2 = Promise$1;

/* Built-in method references that are verified to be native. */
var Set$1 = getNative(root$1, 'Set');
var Set$2 = Set$1;

/** `Object#toString` result references. */
var mapTag$3 = '[object Map]',
  objectTag$1 = '[object Object]',
  promiseTag = '[object Promise]',
  setTag$3 = '[object Set]',
  weakMapTag$1 = '[object WeakMap]';
var dataViewTag$2 = '[object DataView]';

/** Used to detect maps, sets, and weakmaps. */
var dataViewCtorString = toSource(DataView$1),
  mapCtorString = toSource(Map$1),
  promiseCtorString = toSource(Promise$2),
  setCtorString = toSource(Set$2),
  weakMapCtorString = toSource(WeakMap$1);

/**
 * Gets the `toStringTag` of `value`.
 *
 * @private
 * @param {*} value The value to query.
 * @returns {string} Returns the `toStringTag`.
 */
var getTag = baseGetTag;

// Fallback for data views, maps, sets, and weak maps in IE 11 and promises in Node.js < 6.
if (DataView$1 && getTag(new DataView$1(new ArrayBuffer(1))) != dataViewTag$2 || Map$1 && getTag(new Map$1()) != mapTag$3 || Promise$2 && getTag(Promise$2.resolve()) != promiseTag || Set$2 && getTag(new Set$2()) != setTag$3 || WeakMap$1 && getTag(new WeakMap$1()) != weakMapTag$1) {
  getTag = function (value) {
    var result = baseGetTag(value),
      Ctor = result == objectTag$1 ? value.constructor : undefined,
      ctorString = Ctor ? toSource(Ctor) : '';
    if (ctorString) {
      switch (ctorString) {
        case dataViewCtorString:
          return dataViewTag$2;
        case mapCtorString:
          return mapTag$3;
        case promiseCtorString:
          return promiseTag;
        case setCtorString:
          return setTag$3;
        case weakMapCtorString:
          return weakMapTag$1;
      }
    }
    return result;
  };
}
var getTag$1 = getTag;

/** Used for built-in method references. */
var objectProto = Object.prototype;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Initializes an array clone.
 *
 * @private
 * @param {Array} array The array to clone.
 * @returns {Array} Returns the initialized clone.
 */
function initCloneArray(array) {
  var length = array.length,
    result = new array.constructor(length);

  // Add properties assigned by `RegExp#exec`.
  if (length && typeof array[0] == 'string' && hasOwnProperty.call(array, 'index')) {
    result.index = array.index;
    result.input = array.input;
  }
  return result;
}

/** Built-in value references. */
var Uint8Array = root$1.Uint8Array;
var Uint8Array$1 = Uint8Array;

/**
 * Creates a clone of `arrayBuffer`.
 *
 * @private
 * @param {ArrayBuffer} arrayBuffer The array buffer to clone.
 * @returns {ArrayBuffer} Returns the cloned array buffer.
 */
function cloneArrayBuffer(arrayBuffer) {
  var result = new arrayBuffer.constructor(arrayBuffer.byteLength);
  new Uint8Array$1(result).set(new Uint8Array$1(arrayBuffer));
  return result;
}

/**
 * Creates a clone of `dataView`.
 *
 * @private
 * @param {Object} dataView The data view to clone.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Object} Returns the cloned data view.
 */
function cloneDataView(dataView, isDeep) {
  var buffer = isDeep ? cloneArrayBuffer(dataView.buffer) : dataView.buffer;
  return new dataView.constructor(buffer, dataView.byteOffset, dataView.byteLength);
}

/** Used to match `RegExp` flags from their coerced string values. */
var reFlags = /\w*$/;

/**
 * Creates a clone of `regexp`.
 *
 * @private
 * @param {Object} regexp The regexp to clone.
 * @returns {Object} Returns the cloned regexp.
 */
function cloneRegExp(regexp) {
  var result = new regexp.constructor(regexp.source, reFlags.exec(regexp));
  result.lastIndex = regexp.lastIndex;
  return result;
}

/** Used to convert symbols to primitives and strings. */
var symbolProto = Symbol$1 ? Symbol$1.prototype : undefined,
  symbolValueOf = symbolProto ? symbolProto.valueOf : undefined;

/**
 * Creates a clone of the `symbol` object.
 *
 * @private
 * @param {Object} symbol The symbol object to clone.
 * @returns {Object} Returns the cloned symbol object.
 */
function cloneSymbol(symbol) {
  return symbolValueOf ? Object(symbolValueOf.call(symbol)) : {};
}

/**
 * Creates a clone of `typedArray`.
 *
 * @private
 * @param {Object} typedArray The typed array to clone.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Object} Returns the cloned typed array.
 */
function cloneTypedArray(typedArray, isDeep) {
  var buffer = isDeep ? cloneArrayBuffer(typedArray.buffer) : typedArray.buffer;
  return new typedArray.constructor(buffer, typedArray.byteOffset, typedArray.length);
}

/** `Object#toString` result references. */
var boolTag$1 = '[object Boolean]',
  dateTag$1 = '[object Date]',
  mapTag$2 = '[object Map]',
  numberTag$1 = '[object Number]',
  regexpTag$1 = '[object RegExp]',
  setTag$2 = '[object Set]',
  stringTag$1 = '[object String]',
  symbolTag$1 = '[object Symbol]';
var arrayBufferTag$1 = '[object ArrayBuffer]',
  dataViewTag$1 = '[object DataView]',
  float32Tag$1 = '[object Float32Array]',
  float64Tag$1 = '[object Float64Array]',
  int8Tag$1 = '[object Int8Array]',
  int16Tag$1 = '[object Int16Array]',
  int32Tag$1 = '[object Int32Array]',
  uint8Tag$1 = '[object Uint8Array]',
  uint8ClampedTag$1 = '[object Uint8ClampedArray]',
  uint16Tag$1 = '[object Uint16Array]',
  uint32Tag$1 = '[object Uint32Array]';

/**
 * Initializes an object clone based on its `toStringTag`.
 *
 * **Note:** This function only supports cloning values with tags of
 * `Boolean`, `Date`, `Error`, `Map`, `Number`, `RegExp`, `Set`, or `String`.
 *
 * @private
 * @param {Object} object The object to clone.
 * @param {string} tag The `toStringTag` of the object to clone.
 * @param {boolean} [isDeep] Specify a deep clone.
 * @returns {Object} Returns the initialized clone.
 */
function initCloneByTag(object, tag, isDeep) {
  var Ctor = object.constructor;
  switch (tag) {
    case arrayBufferTag$1:
      return cloneArrayBuffer(object);
    case boolTag$1:
    case dateTag$1:
      return new Ctor(+object);
    case dataViewTag$1:
      return cloneDataView(object, isDeep);
    case float32Tag$1:
    case float64Tag$1:
    case int8Tag$1:
    case int16Tag$1:
    case int32Tag$1:
    case uint8Tag$1:
    case uint8ClampedTag$1:
    case uint16Tag$1:
    case uint32Tag$1:
      return cloneTypedArray(object, isDeep);
    case mapTag$2:
      return new Ctor();
    case numberTag$1:
    case stringTag$1:
      return new Ctor(object);
    case regexpTag$1:
      return cloneRegExp(object);
    case setTag$2:
      return new Ctor();
    case symbolTag$1:
      return cloneSymbol(object);
  }
}

/**
 * Initializes an object clone.
 *
 * @private
 * @param {Object} object The object to clone.
 * @returns {Object} Returns the initialized clone.
 */
function initCloneObject(object) {
  return typeof object.constructor == 'function' && !isPrototype(object) ? baseCreate$1(getPrototype$1(object)) : {};
}

/** `Object#toString` result references. */
var mapTag$1 = '[object Map]';

/**
 * The base implementation of `_.isMap` without Node.js optimizations.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a map, else `false`.
 */
function baseIsMap(value) {
  return isObjectLike(value) && getTag$1(value) == mapTag$1;
}

/* Node.js helper references. */
var nodeIsMap = nodeUtil$1 && nodeUtil$1.isMap;

/**
 * Checks if `value` is classified as a `Map` object.
 *
 * @static
 * @memberOf _
 * @since 4.3.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a map, else `false`.
 * @example
 *
 * _.isMap(new Map);
 * // => true
 *
 * _.isMap(new WeakMap);
 * // => false
 */
var isMap = nodeIsMap ? baseUnary(nodeIsMap) : baseIsMap;
var isMap$1 = isMap;

/** `Object#toString` result references. */
var setTag$1 = '[object Set]';

/**
 * The base implementation of `_.isSet` without Node.js optimizations.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a set, else `false`.
 */
function baseIsSet(value) {
  return isObjectLike(value) && getTag$1(value) == setTag$1;
}

/* Node.js helper references. */
var nodeIsSet = nodeUtil$1 && nodeUtil$1.isSet;

/**
 * Checks if `value` is classified as a `Set` object.
 *
 * @static
 * @memberOf _
 * @since 4.3.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a set, else `false`.
 * @example
 *
 * _.isSet(new Set);
 * // => true
 *
 * _.isSet(new WeakSet);
 * // => false
 */
var isSet = nodeIsSet ? baseUnary(nodeIsSet) : baseIsSet;
var isSet$1 = isSet;

/** Used to compose bitmasks for cloning. */
var CLONE_DEEP_FLAG$1 = 1,
  CLONE_FLAT_FLAG = 2,
  CLONE_SYMBOLS_FLAG$1 = 4;

/** `Object#toString` result references. */
var argsTag = '[object Arguments]',
  arrayTag = '[object Array]',
  boolTag = '[object Boolean]',
  dateTag = '[object Date]',
  errorTag = '[object Error]',
  funcTag = '[object Function]',
  genTag = '[object GeneratorFunction]',
  mapTag = '[object Map]',
  numberTag = '[object Number]',
  objectTag = '[object Object]',
  regexpTag = '[object RegExp]',
  setTag = '[object Set]',
  stringTag = '[object String]',
  symbolTag = '[object Symbol]',
  weakMapTag = '[object WeakMap]';
var arrayBufferTag = '[object ArrayBuffer]',
  dataViewTag = '[object DataView]',
  float32Tag = '[object Float32Array]',
  float64Tag = '[object Float64Array]',
  int8Tag = '[object Int8Array]',
  int16Tag = '[object Int16Array]',
  int32Tag = '[object Int32Array]',
  uint8Tag = '[object Uint8Array]',
  uint8ClampedTag = '[object Uint8ClampedArray]',
  uint16Tag = '[object Uint16Array]',
  uint32Tag = '[object Uint32Array]';

/** Used to identify `toStringTag` values supported by `_.clone`. */
var cloneableTags = {};
cloneableTags[argsTag] = cloneableTags[arrayTag] = cloneableTags[arrayBufferTag] = cloneableTags[dataViewTag] = cloneableTags[boolTag] = cloneableTags[dateTag] = cloneableTags[float32Tag] = cloneableTags[float64Tag] = cloneableTags[int8Tag] = cloneableTags[int16Tag] = cloneableTags[int32Tag] = cloneableTags[mapTag] = cloneableTags[numberTag] = cloneableTags[objectTag] = cloneableTags[regexpTag] = cloneableTags[setTag] = cloneableTags[stringTag] = cloneableTags[symbolTag] = cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] = cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
cloneableTags[errorTag] = cloneableTags[funcTag] = cloneableTags[weakMapTag] = false;

/**
 * The base implementation of `_.clone` and `_.cloneDeep` which tracks
 * traversed objects.
 *
 * @private
 * @param {*} value The value to clone.
 * @param {boolean} bitmask The bitmask flags.
 *  1 - Deep clone
 *  2 - Flatten inherited properties
 *  4 - Clone symbols
 * @param {Function} [customizer] The function to customize cloning.
 * @param {string} [key] The key of `value`.
 * @param {Object} [object] The parent object of `value`.
 * @param {Object} [stack] Tracks traversed objects and their clone counterparts.
 * @returns {*} Returns the cloned value.
 */
function baseClone(value, bitmask, customizer, key, object, stack) {
  var result,
    isDeep = bitmask & CLONE_DEEP_FLAG$1,
    isFlat = bitmask & CLONE_FLAT_FLAG,
    isFull = bitmask & CLONE_SYMBOLS_FLAG$1;
  if (customizer) {
    result = object ? customizer(value, key, object, stack) : customizer(value);
  }
  if (result !== undefined) {
    return result;
  }
  if (!isObject(value)) {
    return value;
  }
  var isArr = isArray$1(value);
  if (isArr) {
    result = initCloneArray(value);
    if (!isDeep) {
      return copyArray(value, result);
    }
  } else {
    var tag = getTag$1(value),
      isFunc = tag == funcTag || tag == genTag;
    if (isBuffer$1(value)) {
      return cloneBuffer(value, isDeep);
    }
    if (tag == objectTag || tag == argsTag || isFunc && !object) {
      result = isFlat || isFunc ? {} : initCloneObject(value);
      if (!isDeep) {
        return isFlat ? copySymbolsIn(value, baseAssignIn(result, value)) : copySymbols(value, baseAssign(result, value));
      }
    } else {
      if (!cloneableTags[tag]) {
        return object ? value : {};
      }
      result = initCloneByTag(value, tag, isDeep);
    }
  }
  // Check for circular references and return its corresponding clone.
  stack || (stack = new Stack());
  var stacked = stack.get(value);
  if (stacked) {
    return stacked;
  }
  stack.set(value, result);
  if (isSet$1(value)) {
    value.forEach(function (subValue) {
      result.add(baseClone(subValue, bitmask, customizer, subValue, value, stack));
    });
  } else if (isMap$1(value)) {
    value.forEach(function (subValue, key) {
      result.set(key, baseClone(subValue, bitmask, customizer, key, value, stack));
    });
  }
  var keysFunc = isFull ? isFlat ? getAllKeysIn : getAllKeys : isFlat ? keysIn : keys;
  var props = isArr ? undefined : keysFunc(value);
  arrayEach(props || value, function (subValue, key) {
    if (props) {
      key = subValue;
      subValue = value[key];
    }
    // Recursively populate clone (susceptible to call stack limits).
    assignValue(result, key, baseClone(subValue, bitmask, customizer, key, value, stack));
  });
  return result;
}

/** Used to compose bitmasks for cloning. */
var CLONE_DEEP_FLAG = 1,
  CLONE_SYMBOLS_FLAG = 4;

/**
 * This method is like `_.clone` except that it recursively clones `value`.
 *
 * @static
 * @memberOf _
 * @since 1.0.0
 * @category Lang
 * @param {*} value The value to recursively clone.
 * @returns {*} Returns the deep cloned value.
 * @see _.clone
 * @example
 *
 * var objects = [{ 'a': 1 }, { 'b': 2 }];
 *
 * var deep = _.cloneDeep(objects);
 * console.log(deep[0] === objects[0]);
 * // => false
 */
function cloneDeep(value) {
  return baseClone(value, CLONE_DEEP_FLAG | CLONE_SYMBOLS_FLAG);
}

const TYPE_KEY = "typeInfo";
var TypeBrand;
(function (TypeBrand) {
  TypeBrand["BIGINT"] = "bigint";
  TypeBrand["DATE"] = "date";
})(TypeBrand || (TypeBrand = {}));
const ACCOUNT_ID_REGEX = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
/**
 * Asserts that the expression passed to the function is truthy, otherwise throws a new Error with the provided message.
 *
 * @param expression - The expression to be asserted.
 * @param message - The error message to be printed.
 */
function assert(expression, message) {
  if (!expression) {
    throw new Error("assertion failed: " + message);
  }
}
function serialize(valueToSerialize) {
  return encode(JSON.stringify(valueToSerialize, function (key, value) {
    if (typeof value === "bigint") {
      return {
        value: value.toString(),
        [TYPE_KEY]: TypeBrand.BIGINT
      };
    }
    if (typeof this[key] === "object" && this[key] !== null && this[key] instanceof Date) {
      return {
        value: this[key].toISOString(),
        [TYPE_KEY]: TypeBrand.DATE
      };
    }
    return value;
  }));
}
function deserialize(valueToDeserialize) {
  return JSON.parse(decode(valueToDeserialize), (_, value) => {
    if (value !== null && typeof value === "object" && Object.keys(value).length === 2 && Object.keys(value).every(key => ["value", TYPE_KEY].includes(key))) {
      switch (value[TYPE_KEY]) {
        case TypeBrand.BIGINT:
          return BigInt(value["value"]);
        case TypeBrand.DATE:
          return new Date(value["value"]);
      }
    }
    return value;
  });
}
function decodeObj2class(class_instance, obj) {
  if (typeof obj != "object" || typeof obj === "bigint" || obj instanceof Date || class_instance.constructor.schema === undefined) {
    return obj;
  }
  let key;
  for (key in obj) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const value = obj[key];
    if (typeof value == "object") {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const ty = class_instance.constructor.schema[key];
      // eslint-disable-next-line no-prototype-builtins
      if (ty !== undefined && ty.hasOwnProperty("map")) {
        for (const mkey in value) {
          if (ty["map"]["value"] === "string") {
            class_instance[key][mkey] = value[mkey];
          } else {
            class_instance[key][mkey] = decodeObj2class(new ty["map"]["value"](), value[mkey]);
          }
        }
        // eslint-disable-next-line no-prototype-builtins
      } else if (ty !== undefined && ty.hasOwnProperty("array")) {
        for (const k in value) {
          if (ty["array"]["value"] === "string") {
            class_instance[key].push(value[k]);
          } else {
            class_instance[key].push(decodeObj2class(new ty["array"]["value"](), value[k]));
          }
        }
        // eslint-disable-next-line no-prototype-builtins
      } else if (ty !== undefined && ty.hasOwnProperty("class")) {
        // => nested_lookup_recordes:  {class: UnorderedMap, value: {class: LookupMap }},
        class_instance[key] = ty["class"].reconstruct(obj[key]);
        // eslint-disable-next-line no-prototype-builtins
        if (ty.hasOwnProperty("value")) {
          const subtype_value = ty["value"];
          class_instance[key].subtype = function () {
            // example: { collection: {reconstructor: LookupMap.reconstruct, value: 'string'}}
            // example: UnorderedMap or {class: UnorderedMap, value: 'string'}
            return subtype_value;
          };
        }
      } else if (ty !== undefined && typeof ty.reconstruct === "function") {
        class_instance[key] = ty.reconstruct(obj[key]);
      } else {
        // normal case with nested Class, such as field is truck: Truck,
        class_instance[key] = decodeObj2class(class_instance[key], obj[key]);
      }
    } else {
      class_instance[key] = obj[key];
    }
  }
  const instance_tmp = cloneDeep(class_instance);
  for (key in obj) {
    if (typeof class_instance[key] == "object" && !(class_instance[key] instanceof Date)) {
      class_instance[key] = instance_tmp[key];
    }
  }
  return class_instance;
}
/**
 * Validates the Account ID according to the NEAR protocol
 * [Account ID rules](https://nomicon.io/DataStructures/Account#account-id-rules).
 *
 * @param accountId - The Account ID string you want to validate.
 */
function validateAccountId(accountId) {
  return accountId.length >= 2 && accountId.length <= 64 && ACCOUNT_ID_REGEX.test(accountId);
}
/**
 * Convert a string to Uint8Array, each character must have a char code between 0-255.
 * @param s - string that with only Latin1 character to convert
 * @returns result Uint8Array
 */
function bytes(s) {
  return env.latin1_string_to_uint8array(s);
}
/**
 * Convert a Uint8Array to string, each uint8 to the single character of that char code
 * @param a - Uint8Array to convert
 * @returns result string
 */
function str(a) {
  return env.uint8array_to_latin1_string(a);
}
/**
 * Encode the string to Uint8Array with UTF-8 encoding
 * @param s - String to encode
 * @returns result Uint8Array
 */
function encode(s) {
  return env.utf8_string_to_uint8array(s);
}
/**
 * Decode the Uint8Array to string in UTF-8 encoding
 * @param a - array to decode
 * @returns result string
 */
function decode(a) {
  return env.uint8array_to_utf8_string(a);
}

var CurveType;
(function (CurveType) {
  CurveType[CurveType["ED25519"] = 0] = "ED25519";
  CurveType[CurveType["SECP256K1"] = 1] = "SECP256K1";
})(CurveType || (CurveType = {}));
var DataLength;
(function (DataLength) {
  DataLength[DataLength["ED25519"] = 32] = "ED25519";
  DataLength[DataLength["SECP256K1"] = 64] = "SECP256K1";
})(DataLength || (DataLength = {}));

/**
 * A Promise result in near can be one of:
 * - NotReady = 0 - the promise you are specifying is still not ready, not yet failed nor successful.
 * - Successful = 1 - the promise has been successfully executed and you can retrieve the resulting value.
 * - Failed = 2 - the promise execution has failed.
 */
var PromiseResult;
(function (PromiseResult) {
  PromiseResult[PromiseResult["NotReady"] = 0] = "NotReady";
  PromiseResult[PromiseResult["Successful"] = 1] = "Successful";
  PromiseResult[PromiseResult["Failed"] = 2] = "Failed";
})(PromiseResult || (PromiseResult = {}));
/**
 * A promise error can either be due to the promise failing or not yet being ready.
 */
var PromiseError;
(function (PromiseError) {
  PromiseError[PromiseError["Failed"] = 0] = "Failed";
  PromiseError[PromiseError["NotReady"] = 1] = "NotReady";
})(PromiseError || (PromiseError = {}));

const U64_MAX = 2n ** 64n - 1n;
const EVICTED_REGISTER = U64_MAX - 1n;
/**
 * Returns the account ID of the account that signed the transaction.
 * Can only be called in a call or initialize function.
 */
function signerAccountId() {
  env.signer_account_id(0);
  return str(env.read_register(0));
}
/**
 * Returns the account ID of the account that called the function.
 * Can only be called in a call or initialize function.
 */
function predecessorAccountId() {
  env.predecessor_account_id(0);
  return str(env.read_register(0));
}
/**
 * Returns the account ID of the current contract - the contract that is being executed.
 */
function currentAccountId() {
  env.current_account_id(0);
  return str(env.read_register(0));
}
/**
 * Returns the current block timestamp.
 */
function blockTimestamp() {
  return env.block_timestamp();
}
/**
 * Returns the amount of NEAR attached to this function call.
 * Can only be called in payable functions.
 */
function attachedDeposit() {
  return env.attached_deposit();
}
/**
 * Returns the amount of Gas that was attached to this function call.
 */
function prepaidGas() {
  return env.prepaid_gas();
}
/**
 * Returns the current account's account balance.
 */
function accountBalance() {
  return env.account_balance();
}
/**
 * Reads the value from NEAR storage that is stored under the provided key.
 *
 * @param key - The key to read from storage.
 */
function storageReadRaw(key) {
  const returnValue = env.storage_read(key, 0);
  if (returnValue !== 1n) {
    return null;
  }
  return env.read_register(0);
}
/**
 * Reads the utf-8 string value from NEAR storage that is stored under the provided key.
 *
 * @param key - The utf-8 string key to read from storage.
 */
function storageRead(key) {
  const ret = storageReadRaw(encode(key));
  if (ret !== null) {
    return decode(ret);
  }
  return null;
}
/**
 * Returns the current accounts NEAR storage usage.
 */
function storageUsage() {
  return env.storage_usage();
}
/**
 * Writes the provided bytes to NEAR storage under the provided key.
 *
 * @param key - The key under which to store the value.
 * @param value - The value to store.
 */
function storageWriteRaw(key, value) {
  return env.storage_write(key, value, EVICTED_REGISTER) === 1n;
}
/**
 * Writes the provided utf-8 string to NEAR storage under the provided key.
 *
 * @param key - The utf-8 string key under which to store the value.
 * @param value - The utf-8 string value to store.
 */
function storageWrite(key, value) {
  return storageWriteRaw(encode(key), encode(value));
}
/**
 * Returns the cost of storing 0 Byte on NEAR storage.
 */
function storageByteCost() {
  return 10000000000000000000n;
}
/**
 * Returns the arguments passed to the current smart contract call.
 */
function inputRaw() {
  env.input(0);
  return env.read_register(0);
}
/**
 * Returns the arguments passed to the current smart contract call as utf-8 string.
 */
function input() {
  return decode(inputRaw());
}
/**
 * Join an arbitrary array of NEAR promises.
 *
 * @param promiseIndexes - An arbitrary array of NEAR promise indexes to join.
 */
function promiseAnd(...promiseIndexes) {
  return env.promise_and(...promiseIndexes);
}
/**
 * Create a NEAR promise which will have multiple promise actions inside.
 *
 * @param accountId - The account ID of the target contract.
 */
function promiseBatchCreate(accountId) {
  return env.promise_batch_create(accountId);
}
/**
 * Attach a callback NEAR promise to a batch of NEAR promise actions.
 *
 * @param promiseIndex - The NEAR promise index of the batch.
 * @param accountId - The account ID of the target contract.
 */
function promiseBatchThen(promiseIndex, accountId) {
  return env.promise_batch_then(promiseIndex, accountId);
}
/**
 * Attach a create account promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a create account action to.
 */
function promiseBatchActionCreateAccount(promiseIndex) {
  env.promise_batch_action_create_account(promiseIndex);
}
/**
 * Attach a deploy contract promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a deploy contract action to.
 * @param code - The WASM byte code of the contract to be deployed.
 */
function promiseBatchActionDeployContract(promiseIndex, code) {
  env.promise_batch_action_deploy_contract(promiseIndex, code);
}
/**
 * Attach a function call promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a function call action to.
 * @param methodName - The name of the method to be called.
 * @param args - The arguments to call the method with.
 * @param amount - The amount of NEAR to attach to the call.
 * @param gas - The amount of Gas to attach to the call.
 */
function promiseBatchActionFunctionCallRaw(promiseIndex, methodName, args, amount, gas) {
  env.promise_batch_action_function_call(promiseIndex, methodName, args, amount, gas);
}
/**
 * Attach a function call promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a function call action to.
 * @param methodName - The name of the method to be called.
 * @param args - The utf-8 string arguments to call the method with.
 * @param amount - The amount of NEAR to attach to the call.
 * @param gas - The amount of Gas to attach to the call.
 */
function promiseBatchActionFunctionCall(promiseIndex, methodName, args, amount, gas) {
  promiseBatchActionFunctionCallRaw(promiseIndex, methodName, encode(args), amount, gas);
}
/**
 * Attach a transfer promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a transfer action to.
 * @param amount - The amount of NEAR to transfer.
 */
function promiseBatchActionTransfer(promiseIndex, amount) {
  env.promise_batch_action_transfer(promiseIndex, amount);
}
/**
 * Attach a stake promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a stake action to.
 * @param amount - The amount of NEAR to stake.
 * @param publicKey - The public key with which to stake.
 */
function promiseBatchActionStake(promiseIndex, amount, publicKey) {
  env.promise_batch_action_stake(promiseIndex, amount, publicKey);
}
/**
 * Attach a add full access key promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a add full access key action to.
 * @param publicKey - The public key to add as a full access key.
 * @param nonce - The nonce to use.
 */
function promiseBatchActionAddKeyWithFullAccess(promiseIndex, publicKey, nonce) {
  env.promise_batch_action_add_key_with_full_access(promiseIndex, publicKey, nonce);
}
/**
 * Attach a add access key promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a add access key action to.
 * @param publicKey - The public key to add.
 * @param nonce - The nonce to use.
 * @param allowance - The allowance of the access key.
 * @param receiverId - The account ID of the receiver.
 * @param methodNames - The names of the method to allow the key for.
 */
function promiseBatchActionAddKeyWithFunctionCall(promiseIndex, publicKey, nonce, allowance, receiverId, methodNames) {
  env.promise_batch_action_add_key_with_function_call(promiseIndex, publicKey, nonce, allowance, receiverId, methodNames);
}
/**
 * Attach a delete key promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a delete key action to.
 * @param publicKey - The public key to delete.
 */
function promiseBatchActionDeleteKey(promiseIndex, publicKey) {
  env.promise_batch_action_delete_key(promiseIndex, publicKey);
}
/**
 * Attach a delete account promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a delete account action to.
 * @param beneficiaryId - The account ID of the beneficiary - the account that receives the remaining amount of NEAR.
 */
function promiseBatchActionDeleteAccount(promiseIndex, beneficiaryId) {
  env.promise_batch_action_delete_account(promiseIndex, beneficiaryId);
}
/**
 * Attach a function call with weight promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a function call with weight action to.
 * @param methodName - The name of the method to be called.
 * @param args - The arguments to call the method with.
 * @param amount - The amount of NEAR to attach to the call.
 * @param gas - The amount of Gas to attach to the call.
 * @param weight - The weight of unused Gas to use.
 */
function promiseBatchActionFunctionCallWeightRaw(promiseIndex, methodName, args, amount, gas, weight) {
  env.promise_batch_action_function_call_weight(promiseIndex, methodName, args, amount, gas, weight);
}
/**
 * Attach a function call with weight promise action to the NEAR promise index with the provided promise index.
 *
 * @param promiseIndex - The index of the promise to attach a function call with weight action to.
 * @param methodName - The name of the method to be called.
 * @param args - The utf-8 string arguments to call the method with.
 * @param amount - The amount of NEAR to attach to the call.
 * @param gas - The amount of Gas to attach to the call.
 * @param weight - The weight of unused Gas to use.
 */
function promiseBatchActionFunctionCallWeight(promiseIndex, methodName, args, amount, gas, weight) {
  promiseBatchActionFunctionCallWeightRaw(promiseIndex, methodName, encode(args), amount, gas, weight);
}
/**
 * The number of promise results available.
 */
function promiseResultsCount() {
  return env.promise_results_count();
}
/**
 * Returns the result of the NEAR promise for the passed promise index.
 *
 * @param promiseIndex - The index of the promise to return the result for.
 */
function promiseResultRaw(promiseIndex) {
  const status = env.promise_result(promiseIndex, 0);
  assert(Number(status) === PromiseResult.Successful, `Promise result ${status == PromiseResult.Failed ? "Failed" : status == PromiseResult.NotReady ? "NotReady" : status}`);
  return env.read_register(0);
}
/**
 * Returns the result of the NEAR promise for the passed promise index as utf-8 string
 *
 * @param promiseIndex - The index of the promise to return the result for.
 */
function promiseResult(promiseIndex) {
  return decode(promiseResultRaw(promiseIndex));
}
/**
 * Executes the promise in the NEAR WASM virtual machine.
 *
 * @param promiseIndex - The index of the promise to execute.
 */
function promiseReturn(promiseIndex) {
  env.promise_return(promiseIndex);
}
/**
 * Returns sha256 hash of given value
 * @param value - value to be hashed, in Bytes
 * @returns hash result in Bytes
 */
function sha256(value) {
  env.sha256(value, 0);
  return env.read_register(0);
}

/**
 * Tells the SDK to use this function as the initialization function of the contract.
 *
 * @param _empty - An empty object.
 */
function initialize(_empty) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (_target, _key, _descriptor
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  ) {};
}
/**
 * Tells the SDK to expose this function as a view function.
 *
 * @param _empty - An empty object.
 */
function view(_empty) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (_target, _key, _descriptor
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  ) {};
}
function call({
  privateFunction = false,
  payableFunction = false
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (_target, _key, descriptor) {
    const originalMethod = descriptor.value;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    descriptor.value = function (...args) {
      if (privateFunction && predecessorAccountId() !== currentAccountId()) {
        throw new Error("Function is private");
      }
      if (!payableFunction && attachedDeposit() > 0n) {
        throw new Error("Function is not payable");
      }
      return originalMethod.apply(this, args);
    };
  };
}
function NearBindgen({
  requireInit = false,
  serializer = serialize,
  deserializer = deserialize
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return target => {
    return class extends target {
      static _create() {
        return new target();
      }
      static _getState() {
        const rawState = storageReadRaw(bytes("STATE"));
        return rawState ? this._deserialize(rawState) : null;
      }
      static _saveToStorage(objectToSave) {
        storageWriteRaw(bytes("STATE"), this._serialize(objectToSave));
      }
      static _getArgs() {
        return JSON.parse(input() || "{}");
      }
      static _serialize(value, forReturn = false) {
        if (forReturn) {
          return encode(JSON.stringify(value, (_, value) => typeof value === "bigint" ? `${value}` : value));
        }
        return serializer(value);
      }
      static _deserialize(value) {
        return deserializer(value);
      }
      static _reconstruct(classObject, plainObject) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        if (classObject.constructor.schema === undefined) {
          for (const item in classObject) {
            const reconstructor = classObject[item].constructor?.reconstruct;
            classObject[item] = reconstructor ? reconstructor(plainObject[item]) : plainObject[item];
          }
          return classObject;
        }
        return decodeObj2class(classObject, plainObject);
      }
      static _requireInit() {
        return requireInit;
      }
    };
  };
}

/**
 * A promise action which can be executed on the NEAR blockchain.
 */
class PromiseAction {}
/**
 * A create account promise action.
 *
 * @extends {PromiseAction}
 */
class CreateAccount extends PromiseAction {
  add(promiseIndex) {
    promiseBatchActionCreateAccount(promiseIndex);
  }
}
/**
 * A deploy contract promise action.
 *
 * @extends {PromiseAction}
 */
class DeployContract extends PromiseAction {
  /**
   * @param code - The code of the contract to be deployed.
   */
  constructor(code) {
    super();
    this.code = code;
  }
  add(promiseIndex) {
    promiseBatchActionDeployContract(promiseIndex, this.code);
  }
}
/**
 * A function call promise action.
 *
 * @extends {PromiseAction}
 */
class FunctionCall extends PromiseAction {
  /**
   * @param functionName - The name of the function to be called.
   * @param args - The utf-8 string arguments to be passed to the function.
   * @param amount - The amount of NEAR to attach to the call.
   * @param gas - The amount of Gas to attach to the call.
   */
  constructor(functionName, args, amount, gas) {
    super();
    this.functionName = functionName;
    this.args = args;
    this.amount = amount;
    this.gas = gas;
  }
  add(promiseIndex) {
    promiseBatchActionFunctionCall(promiseIndex, this.functionName, this.args, this.amount, this.gas);
  }
}
/**
 * A function call raw promise action.
 *
 * @extends {PromiseAction}
 */
class FunctionCallRaw extends PromiseAction {
  /**
   * @param functionName - The name of the function to be called.
   * @param args - The arguments to be passed to the function.
   * @param amount - The amount of NEAR to attach to the call.
   * @param gas - The amount of Gas to attach to the call.
   */
  constructor(functionName, args, amount, gas) {
    super();
    this.functionName = functionName;
    this.args = args;
    this.amount = amount;
    this.gas = gas;
  }
  add(promiseIndex) {
    promiseBatchActionFunctionCallRaw(promiseIndex, this.functionName, this.args, this.amount, this.gas);
  }
}
/**
 * A function call weight promise action.
 *
 * @extends {PromiseAction}
 */
class FunctionCallWeight extends PromiseAction {
  /**
   * @param functionName - The name of the function to be called.
   * @param args - The utf-8 string arguments to be passed to the function.
   * @param amount - The amount of NEAR to attach to the call.
   * @param gas - The amount of Gas to attach to the call.
   * @param weight - The weight of unused Gas to use.
   */
  constructor(functionName, args, amount, gas, weight) {
    super();
    this.functionName = functionName;
    this.args = args;
    this.amount = amount;
    this.gas = gas;
    this.weight = weight;
  }
  add(promiseIndex) {
    promiseBatchActionFunctionCallWeight(promiseIndex, this.functionName, this.args, this.amount, this.gas, this.weight);
  }
}
/**
 * A function call weight raw promise action.
 *
 * @extends {PromiseAction}
 */
class FunctionCallWeightRaw extends PromiseAction {
  /**
   * @param functionName - The name of the function to be called.
   * @param args - The arguments to be passed to the function.
   * @param amount - The amount of NEAR to attach to the call.
   * @param gas - The amount of Gas to attach to the call.
   * @param weight - The weight of unused Gas to use.
   */
  constructor(functionName, args, amount, gas, weight) {
    super();
    this.functionName = functionName;
    this.args = args;
    this.amount = amount;
    this.gas = gas;
    this.weight = weight;
  }
  add(promiseIndex) {
    promiseBatchActionFunctionCallWeightRaw(promiseIndex, this.functionName, this.args, this.amount, this.gas, this.weight);
  }
}
/**
 * A transfer promise action.
 *
 * @extends {PromiseAction}
 */
class Transfer extends PromiseAction {
  /**
   * @param amount - The amount of NEAR to tranfer.
   */
  constructor(amount) {
    super();
    this.amount = amount;
  }
  add(promiseIndex) {
    promiseBatchActionTransfer(promiseIndex, this.amount);
  }
}
/**
 * A stake promise action.
 *
 * @extends {PromiseAction}
 */
class Stake extends PromiseAction {
  /**
   * @param amount - The amount of NEAR to tranfer.
   * @param publicKey - The public key to use for staking.
   */
  constructor(amount, publicKey) {
    super();
    this.amount = amount;
    this.publicKey = publicKey;
  }
  add(promiseIndex) {
    promiseBatchActionStake(promiseIndex, this.amount, this.publicKey.data);
  }
}
/**
 * A add full access key promise action.
 *
 * @extends {PromiseAction}
 */
class AddFullAccessKey extends PromiseAction {
  /**
   * @param publicKey - The public key to add as a full access key.
   * @param nonce - The nonce to use.
   */
  constructor(publicKey, nonce) {
    super();
    this.publicKey = publicKey;
    this.nonce = nonce;
  }
  add(promiseIndex) {
    promiseBatchActionAddKeyWithFullAccess(promiseIndex, this.publicKey.data, this.nonce);
  }
}
/**
 * A add access key promise action.
 *
 * @extends {PromiseAction}
 */
class AddAccessKey extends PromiseAction {
  /**
   * @param publicKey - The public key to add as a access key.
   * @param allowance - The allowance for the key in yoctoNEAR.
   * @param receiverId - The account ID of the receiver.
   * @param functionNames - The names of funcitons to authorize.
   * @param nonce - The nonce to use.
   */
  constructor(publicKey, allowance, receiverId, functionNames, nonce) {
    super();
    this.publicKey = publicKey;
    this.allowance = allowance;
    this.receiverId = receiverId;
    this.functionNames = functionNames;
    this.nonce = nonce;
  }
  add(promiseIndex) {
    promiseBatchActionAddKeyWithFunctionCall(promiseIndex, this.publicKey.data, this.nonce, this.allowance, this.receiverId, this.functionNames);
  }
}
/**
 * A delete key promise action.
 *
 * @extends {PromiseAction}
 */
class DeleteKey extends PromiseAction {
  /**
   * @param publicKey - The public key to delete from the account.
   */
  constructor(publicKey) {
    super();
    this.publicKey = publicKey;
  }
  add(promiseIndex) {
    promiseBatchActionDeleteKey(promiseIndex, this.publicKey.data);
  }
}
/**
 * A delete account promise action.
 *
 * @extends {PromiseAction}
 */
class DeleteAccount extends PromiseAction {
  /**
   * @param beneficiaryId - The beneficiary of the account deletion - the account to recieve all of the remaining funds of the deleted account.
   */
  constructor(beneficiaryId) {
    super();
    this.beneficiaryId = beneficiaryId;
  }
  add(promiseIndex) {
    promiseBatchActionDeleteAccount(promiseIndex, this.beneficiaryId);
  }
}
class PromiseSingle {
  constructor(accountId, actions, after, promiseIndex) {
    this.accountId = accountId;
    this.actions = actions;
    this.after = after;
    this.promiseIndex = promiseIndex;
  }
  constructRecursively() {
    if (this.promiseIndex !== null) {
      return this.promiseIndex;
    }
    const promiseIndex = this.after ? promiseBatchThen(this.after.constructRecursively(), this.accountId) : promiseBatchCreate(this.accountId);
    this.actions.forEach(action => action.add(promiseIndex));
    this.promiseIndex = promiseIndex;
    return promiseIndex;
  }
}
class PromiseJoint {
  constructor(promiseA, promiseB, promiseIndex) {
    this.promiseA = promiseA;
    this.promiseB = promiseB;
    this.promiseIndex = promiseIndex;
  }
  constructRecursively() {
    if (this.promiseIndex !== null) {
      return this.promiseIndex;
    }
    const result = promiseAnd(this.promiseA.constructRecursively(), this.promiseB.constructRecursively());
    this.promiseIndex = result;
    return result;
  }
}
/**
 * A high level class to construct and work with NEAR promises.
 */
class NearPromise {
  /**
   * @param subtype - The subtype of the promise.
   * @param shouldReturn - Whether the promise should return.
   */
  constructor(subtype, shouldReturn) {
    this.subtype = subtype;
    this.shouldReturn = shouldReturn;
  }
  /**
   * Creates a new promise to the provided account ID.
   *
   * @param accountId - The account ID on which to call the promise.
   */
  static new(accountId) {
    const subtype = new PromiseSingle(accountId, [], null, null);
    return new NearPromise(subtype, false);
  }
  addAction(action) {
    if (this.subtype instanceof PromiseJoint) {
      throw new Error("Cannot add action to a joint promise.");
    }
    this.subtype.actions.push(action);
    return this;
  }
  /**
   * Creates a create account promise action and adds it to the current promise.
   */
  createAccount() {
    return this.addAction(new CreateAccount());
  }
  /**
   * Creates a deploy contract promise action and adds it to the current promise.
   *
   * @param code - The code of the contract to be deployed.
   */
  deployContract(code) {
    return this.addAction(new DeployContract(code));
  }
  /**
   * Creates a function call promise action and adds it to the current promise.
   *
   * @param functionName - The name of the function to be called.
   * @param args - The utf-8 string arguments to be passed to the function.
   * @param amount - The amount of NEAR to attach to the call.
   * @param gas - The amount of Gas to attach to the call.
   */
  functionCall(functionName, args, amount, gas) {
    return this.addAction(new FunctionCall(functionName, args, amount, gas));
  }
  /**
   * Creates a function call raw promise action and adds it to the current promise.
   *
   * @param functionName - The name of the function to be called.
   * @param args - The arguments to be passed to the function.
   * @param amount - The amount of NEAR to attach to the call.
   * @param gas - The amount of Gas to attach to the call.
   */
  functionCallRaw(functionName, args, amount, gas) {
    return this.addAction(new FunctionCallRaw(functionName, args, amount, gas));
  }
  /**
   * Creates a function call weight promise action and adds it to the current promise.
   *
   * @param functionName - The name of the function to be called.
   * @param args - The utf-8 string arguments to be passed to the function.
   * @param amount - The amount of NEAR to attach to the call.
   * @param gas - The amount of Gas to attach to the call.
   * @param weight - The weight of unused Gas to use.
   */
  functionCallWeight(functionName, args, amount, gas, weight) {
    return this.addAction(new FunctionCallWeight(functionName, args, amount, gas, weight));
  }
  /**
   * Creates a function call weight raw promise action and adds it to the current promise.
   *
   * @param functionName - The name of the function to be called.
   * @param args - The arguments to be passed to the function.
   * @param amount - The amount of NEAR to attach to the call.
   * @param gas - The amount of Gas to attach to the call.
   * @param weight - The weight of unused Gas to use.
   */
  functionCallWeightRaw(functionName, args, amount, gas, weight) {
    return this.addAction(new FunctionCallWeightRaw(functionName, args, amount, gas, weight));
  }
  /**
   * Creates a transfer promise action and adds it to the current promise.
   *
   * @param amount - The amount of NEAR to tranfer.
   */
  transfer(amount) {
    return this.addAction(new Transfer(amount));
  }
  /**
   * Creates a stake promise action and adds it to the current promise.
   *
   * @param amount - The amount of NEAR to tranfer.
   * @param publicKey - The public key to use for staking.
   */
  stake(amount, publicKey) {
    return this.addAction(new Stake(amount, publicKey));
  }
  /**
   * Creates a add full access key promise action and adds it to the current promise.
   * Uses 0n as the nonce.
   *
   * @param publicKey - The public key to add as a full access key.
   */
  addFullAccessKey(publicKey) {
    return this.addFullAccessKeyWithNonce(publicKey, 0n);
  }
  /**
   * Creates a add full access key promise action and adds it to the current promise.
   * Allows you to specify the nonce.
   *
   * @param publicKey - The public key to add as a full access key.
   * @param nonce - The nonce to use.
   */
  addFullAccessKeyWithNonce(publicKey, nonce) {
    return this.addAction(new AddFullAccessKey(publicKey, nonce));
  }
  /**
   * Creates a add access key promise action and adds it to the current promise.
   * Uses 0n as the nonce.
   *
   * @param publicKey - The public key to add as a access key.
   * @param allowance - The allowance for the key in yoctoNEAR.
   * @param receiverId - The account ID of the receiver.
   * @param functionNames - The names of funcitons to authorize.
   */
  addAccessKey(publicKey, allowance, receiverId, functionNames) {
    return this.addAccessKeyWithNonce(publicKey, allowance, receiverId, functionNames, 0n);
  }
  /**
   * Creates a add access key promise action and adds it to the current promise.
   * Allows you to specify the nonce.
   *
   * @param publicKey - The public key to add as a access key.
   * @param allowance - The allowance for the key in yoctoNEAR.
   * @param receiverId - The account ID of the receiver.
   * @param functionNames - The names of funcitons to authorize.
   * @param nonce - The nonce to use.
   */
  addAccessKeyWithNonce(publicKey, allowance, receiverId, functionNames, nonce) {
    return this.addAction(new AddAccessKey(publicKey, allowance, receiverId, functionNames, nonce));
  }
  /**
   * Creates a delete key promise action and adds it to the current promise.
   *
   * @param publicKey - The public key to delete from the account.
   */
  deleteKey(publicKey) {
    return this.addAction(new DeleteKey(publicKey));
  }
  /**
   * Creates a delete account promise action and adds it to the current promise.
   *
   * @param beneficiaryId - The beneficiary of the account deletion - the account to recieve all of the remaining funds of the deleted account.
   */
  deleteAccount(beneficiaryId) {
    return this.addAction(new DeleteAccount(beneficiaryId));
  }
  /**
   * Joins the provided promise with the current promise, making the current promise a joint promise subtype.
   *
   * @param other - The promise to join with the current promise.
   */
  and(other) {
    const subtype = new PromiseJoint(this, other, null);
    return new NearPromise(subtype, false);
  }
  /**
   * Adds a callback to the current promise.
   *
   * @param other - The promise to be executed as the promise.
   */
  then(other) {
    assert(other.subtype instanceof PromiseSingle, "Cannot callback joint promise.");
    assert(other.subtype.after === null, "Cannot callback promise which is already scheduled after another");
    other.subtype.after = this;
    return other;
  }
  /**
   * Sets the shouldReturn field to true.
   */
  asReturn() {
    this.shouldReturn = true;
    return this;
  }
  /**
   * Recursively goes through the current promise to get the promise index.
   */
  constructRecursively() {
    const result = this.subtype.constructRecursively();
    if (this.shouldReturn) {
      promiseReturn(result);
    }
    return result;
  }
  /**
   * Called by NearBindgen, when return object is a NearPromise instance.
   */
  onReturn() {
    this.asReturn().constructRecursively();
  }
  /**
   * Attach the promise to transaction but does not return it. The promise will be executed, but
   * whether it success or not will not affect the transaction result. If you want the promise fail
   * also makes the transaction fail, you can simply return the promise from a @call method.
   */
  build() {
    return this.constructRecursively();
  }
}

const DELIVERY_PROFILE = 'near-encrypted-procurement-delivery-v4',
  RECIPIENT_PROFILE = 'near-procurement-delivery-recipients-v4',
  ASSIGNMENT_PROFILE = 'near-public-procurement-assignment-v4',
  PUBLIC_ACK = 'EXACT_PUBLIC_BRIEF_SOURCE_PERMANENT';
const exact$1 = (v, keys) => assert(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === keys.slice().sort().join(','), 'exact transport fields required');
const digest = v => Array.from(sha256(encode(v))).map(x => x.toString(16).padStart(2, '0')).join('');
const commitment$1 = v => assert(typeof v === 'string' && /^[a-f0-9]{64}$/.test(v), 'transport SHA256 required'),
  block = v => assert(typeof v === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v), 'transport block/code hash required');
const DESC = ['account_id', 'key_id', 'key_version', 'public_key_pem'],
  SEAL = ['account_id', 'key_id', 'key_version', 'sealed_record_key'];
const CONTEXT = ['profile', 'chain_id', 'genesis_hash', 'registry_id', 'registry_code_hash', 'mandate_id', 'policy_sha256', 'company_id', 'goal_id', 'step_id', 'cycle', 'job_id', 'provider', 'owner', 'worker', 'assignment_sha256', 'scope_sha256', 'criteria_sha256', 'recipient_policy_sha256', 'owner_key_id', 'owner_key_version', 'worker_key_id', 'worker_key_version', 'content_sha256'];
const ASSIGN_CONTEXT = ['chain_id', 'genesis_hash', 'registry_id', 'registry_code_hash', 'mandate_id', 'policy_sha256', 'company_id', 'goal_id', 'step_id', 'cycle', 'job_id', 'owner', 'scope_sha256', 'criteria_sha256', 'bid_by', 'delivery_seconds', 'review_seconds', 'expires_at'];
function version(v) {
  assert(typeof v === 'string' && /^[1-9][0-9]{0,9}$/.test(v) && BigInt(v) <= 4294967295n, 'canonical u32 key version required');
}
function network(v) {
  exact$1(v, ['chain_id', 'genesis_hash', 'registry_code_hash']);
  assert(typeof v.chain_id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v.chain_id), 'bounded chain pin required');
  block(v.genesis_hash);
  block(v.registry_code_hash);
}
function recipients(v, owner, worker) {
  exact$1(v, ['profile', 'owner', 'worker']);
  assert(v.profile === RECIPIENT_PROFILE, 'original recipient profile required');
  for (const role of ['owner', 'worker']) {
    const d = v[role];
    exact$1(d, DESC);
    assert(validateAccountId(d.account_id) && d.account_id === (role === 'owner' ? owner : worker), 'original addressed recipient required');
    commitment$1(d.key_id);
    version(d.key_version);
    assert(typeof d.public_key_pem === 'string' && d.public_key_pem.length >= 700 && d.public_key_pem.length <= 2048 && /^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]+-----END PUBLIC KEY-----\n?$/.test(d.public_key_pem), 'bounded public RSA PEM required');
    assert(digest(d.public_key_pem) === d.key_id, 'recipient fingerprint mismatch');
  }
  assert(v.owner.key_id !== v.worker.key_id, 'distinct recipient keys required');
}
const recipientHash = v => digest(JSON.stringify([RECIPIENT_PROFILE, DESC.map(k => v.owner[k]), DESC.map(k => v.worker[k])]));
function readable(text) {
  assert(typeof text === 'string' && text.trim().length > 0 && encode(text).length <= 3000 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text), 'bounded readable3000UTF8 text required');
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      assert(i + 1 < text.length && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff, 'well-formed UTF8 required');
      i++;
    } else assert(c < 0xdc00 || c > 0xdfff, 'well-formed UTF8 required');
  }
  assert(!/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----|ed25519:[1-9A-HJ-NP-Za-km-z]{64,}|\b(?:sk|xi)[_-][A-Za-z0-9]{24,}|\b(?:api[_ -]?key|private[_ -]?key|recovery phrase|seed phrase)\s*[:=]\s*\S+/i.test(text), 'obvious secret pattern rejected');
}
function assignmentContext(m, j) {
  return {
    chain_id: m.policy.network.chain_id,
    genesis_hash: m.policy.network.genesis_hash,
    registry_id: currentAccountId(),
    registry_code_hash: m.policy.network.registry_code_hash,
    mandate_id: m.id,
    policy_sha256: m.policy_sha256,
    company_id: m.policy.company_id,
    goal_id: m.policy.goal_id,
    step_id: j.step_id,
    cycle: j.cycle,
    job_id: j.id,
    owner: m.owner,
    scope_sha256: j.scope_sha256,
    criteria_sha256: j.criteria_sha256,
    bid_by: j.bid_by,
    delivery_seconds: m.policy.delivery_seconds,
    review_seconds: m.policy.review_seconds,
    expires_at: m.policy.expires_at
  };
}
function validateAssignment(value, m, j) {
  exact$1(value, ['profile', 'context', 'source_evidence_sha256', 'text', 'content_sha256', 'assignment_sha256']);
  exact$1(value.context, ASSIGN_CONTEXT);
  assert(value.profile === ASSIGNMENT_PROFILE, 'original assignment profile required');
  const context = assignmentContext(m, j);
  assert(JSON.stringify(ASSIGN_CONTEXT.map(k => value.context[k])) === JSON.stringify(ASSIGN_CONTEXT.map(k => context[k])), 'exact original assignment context required');
  readable(value.text);
  commitment$1(value.source_evidence_sha256);
  commitment$1(value.content_sha256);
  commitment$1(value.assignment_sha256);
  assert(digest(value.text) === value.content_sha256, 'assignment content hash mismatch');
  assert(digest(JSON.stringify([ASSIGNMENT_PROFILE, ASSIGN_CONTEXT.map(k => context[k]), value.source_evidence_sha256, value.content_sha256, value.text])) === value.assignment_sha256, 'assignment packet hash mismatch');
  const result = {
    profile: ASSIGNMENT_PROFILE,
    context,
    source_evidence_sha256: value.source_evidence_sha256,
    text: value.text,
    content_sha256: value.content_sha256,
    assignment_sha256: value.assignment_sha256
  };
  assert(encode(JSON.stringify(result)).length <= 8192, 'assignment record byte bound');
  return result;
}
function base64(value, min, max) {
  assert(typeof value === 'string' && value.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value), 'canonical bounded base64 required');
  const pad = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0,
    last = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.indexOf(value[value.length - pad - 1]);
  assert(pad === 0 || last >= 0 && last % (pad === 2 ? 16 : 4) === 0, 'canonical base64 padding bits required');
  const size = value.length / 4 * 3 - pad;
  assert(size >= min && size <= max, 'decoded encrypted field byte bound');
}
function expectedDelivery(m, j, content_sha256) {
  const p = m.policy.recipient_policy;
  return {
    profile: DELIVERY_PROFILE,
    chain_id: m.policy.network.chain_id,
    genesis_hash: m.policy.network.genesis_hash,
    registry_id: currentAccountId(),
    registry_code_hash: m.policy.network.registry_code_hash,
    mandate_id: m.id,
    policy_sha256: m.policy_sha256,
    company_id: m.policy.company_id,
    goal_id: m.policy.goal_id,
    step_id: j.step_id,
    cycle: j.cycle,
    job_id: j.id,
    provider: j.provider,
    owner: m.owner,
    worker: m.policy.operator,
    assignment_sha256: j.assignment_sha256,
    scope_sha256: j.scope_sha256,
    criteria_sha256: j.criteria_sha256,
    recipient_policy_sha256: recipientHash(p),
    owner_key_id: p.owner.key_id,
    owner_key_version: p.owner.key_version,
    worker_key_id: p.worker.key_id,
    worker_key_version: p.worker.key_version,
    content_sha256
  };
}
function validateDelivery(value, m, j) {
  exact$1(value, ['profile', 'context', 'encrypted_body', 'encrypted_body_sha256', 'sealed_keys', 'envelope_sha256']);
  exact$1(value.context, CONTEXT);
  assert(value.profile === DELIVERY_PROFILE, 'encrypted delivery profile required');
  commitment$1(value.context.content_sha256);
  const context = expectedDelivery(m, j, value.context.content_sha256);
  assert(JSON.stringify(CONTEXT.map(k => value.context[k])) === JSON.stringify(CONTEXT.map(k => context[k])), 'exact original encrypted delivery context required');
  assert(typeof value.encrypted_body === 'string' && encode(value.encrypted_body).length >= 100 && encode(value.encrypted_body).length <= 8192, 'bounded encrypted body required');
  const e = JSON.parse(value.encrypted_body);
  exact$1(e, ['v', 'alg', 'kdf', 'iterations', 'salt', 'iv', 'ciphertext']);
  assert(e.v === 1 && e.alg === 'AES-256-GCM' && e.kdf === 'PBKDF2-SHA256' && e.iterations === 600000, 'supported encrypted body required');
  base64(e.salt, 16, 16);
  base64(e.iv, 12, 12);
  base64(e.ciphertext, 16, 6016);
  assert(value.encrypted_body === JSON.stringify({
    v: e.v,
    alg: e.alg,
    kdf: e.kdf,
    iterations: e.iterations,
    salt: e.salt,
    iv: e.iv,
    ciphertext: e.ciphertext
  }), 'canonical encrypted envelope required');
  commitment$1(value.encrypted_body_sha256);
  assert(digest(value.encrypted_body) === value.encrypted_body_sha256, 'encrypted body hash mismatch');
  exact$1(value.sealed_keys, ['owner', 'worker']);
  const sealed_keys = {};
  for (const role of ['owner', 'worker']) {
    const key = value.sealed_keys[role],
      d = m.policy.recipient_policy[role];
    exact$1(key, SEAL);
    assert(key.account_id === d.account_id && key.key_id === d.key_id && key.key_version === d.key_version, 'original addressed seal required');
    base64(key.sealed_record_key, 512, 512);
    sealed_keys[role] = {
      account_id: key.account_id,
      key_id: key.key_id,
      key_version: key.key_version,
      sealed_record_key: key.sealed_record_key
    };
  }
  const sealed = role => {
    const k = sealed_keys[role];
    return [role, k.account_id, k.key_id, k.key_version, k.sealed_record_key];
  };
  commitment$1(value.envelope_sha256);
  assert(digest(JSON.stringify([DELIVERY_PROFILE, CONTEXT.map(k => context[k]), value.encrypted_body_sha256, value.encrypted_body, sealed('owner'), sealed('worker')])) === value.envelope_sha256, 'original encrypted delivery envelope hash mismatch');
  const result = {
    profile: DELIVERY_PROFILE,
    context,
    encrypted_body: value.encrypted_body,
    encrypted_body_sha256: value.encrypted_body_sha256,
    sealed_keys,
    envelope_sha256: value.envelope_sha256
  };
  assert(encode(JSON.stringify(result)).length <= 16384, 'encrypted delivery record byte bound');
  return result;
}

var _dec, _dec2, _dec3, _dec4, _dec5, _dec6, _dec7, _dec8, _dec9, _dec0, _dec1, _dec10, _dec11, _dec12, _dec13, _dec14, _dec15, _dec16, _dec17, _dec18, _dec19, _dec20, _dec21, _dec22, _dec23, _dec24, _dec25, _dec26, _dec27, _class, _class2;

// PRIVATE SHARED-REGISTRY CANDIDATE. Hashes are not identity/quality proofs.
const PROFILE = 'near-shared-procurement-v4',
  ACCEPTANCE = 'owner_award_assignment_delivery_shared_v4';
const N = 10n ** 24n,
  MAX_MANDATES = 8,
  MAX_JOBS = 8,
  MAX_BIDS = 4,
  OWNER_SLOTS = 8,
  JOB_SLOTS = 2;
const MANDATE_BYTES = 12288,
  JOB_BYTES = 4096,
  TRANSFER_BYTES = 768,
  INDEX_BYTES = 128;
const ASSIGNMENT_BYTES = 8192,
  DELIVERY_BYTES = 16384,
  ASSIGNMENT_ALLOCATION = 12288n,
  DELIVERY_ALLOCATION = 20480n;
const ALLOCATION = 73728n,
  EXTRA = 1280n,
  ROOT_RESERVE = 4096n,
  CUSHION = 65536n,
  CALLBACK_GAS = 60000000000000n;
// near-sdk-js hardcodes this price; it is NOT a live protocol getter.
// Every external funded-action collector must compare fresh protocol config to
// this supported pin and halt on mismatch. This contract cannot query it itself.
const SUPPORTED_STORAGE_BYTE_COST = 10000000000000000000n;
const MONEY = ['available', 'escrow', 'owner_credit', 'provider_credit', 'transfer_pending', 'owner_paid', 'provider_paid'];
const exact = (v, k) => assert(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === k.slice().sort().join(','), 'exact typed fields required');
function amount(v) {
  assert(typeof v === 'string' && /^(0|[1-9][0-9]{0,38})$/.test(v), 'canonical amount required');
  const n = BigInt(v);
  assert(n < 2n ** 128n, 'u128 required');
  return n;
}
const integer = (v, min, max) => assert(Number.isSafeInteger(v) && v >= min && v <= max, 'bounded integer required');
const id = v => assert(typeof v === 'string' && /^[a-z][a-z0-9_-]{0,23}$/.test(v) && !['constructor', 'prototype', '__proto__'].includes(v), 'bounded ID required');
const commitment = v => assert(typeof v === 'string' && /^[a-f0-9]{64}$/.test(v), 'SHA256 required');
function time(v) {
  assert(typeof v === 'string' && /^[1-9][0-9]{0,10}$/.test(v) && BigInt(v) <= 18446744073n, 'finite timestamp required');
  return BigInt(v);
}
const hash = v => Array.from(sha256(encode(v))).map(x => x.toString(16).padStart(2, '0')).join('');
let SharedProcurementV4 = (_dec = NearBindgen({
  requireInit: true
}), _dec2 = view(), _dec3 = view(), _dec4 = call({}), _dec5 = initialize(), _dec6 = view(), _dec7 = view(), _dec8 = call({
  payableFunction: true
}), _dec9 = view(), _dec0 = view(), _dec1 = view(), _dec10 = view(), _dec11 = view(), _dec12 = call({}), _dec13 = call({}), _dec14 = call({}), _dec15 = call({}), _dec16 = call({}), _dec17 = call({}), _dec18 = call({}), _dec19 = call({}), _dec20 = call({}), _dec21 = call({}), _dec22 = call({}), _dec23 = call({}), _dec24 = view(), _dec25 = call({
  payableFunction: true
}), _dec26 = call({
  payableFunction: true
}), _dec27 = call({
  privateFunction: true
}), _dec(_class = (_class2 = class SharedProcurementV4 {
  admin = '';
  frozen = false;
  mandate_count = 0;
  funded = '0';
  available = '0';
  escrow = '0';
  owner_credit = '0';
  provider_credit = '0';
  transfer_pending = '0';
  owner_paid = '0';
  provider_paid = '0';
  storage_collected = '0';
  reserved_bytes = '0';
  allocated_bytes = '0';
  now() {
    return blockTimestamp() / 1000000000n;
  }
  storagePrice() {
    assert(storageByteCost() === SUPPORTED_STORAGE_BYTE_COST, 'unsupported SDK storage-price implementation');
    return SUPPORTED_STORAGE_BYTE_COST;
  }
  zero() {
    assert(attachedDeposit() === 0n, 'zero deposit required');
  }
  direct(a) {
    assert(predecessorAccountId() === a && signerAccountId() === a, 'direct original role required');
  }
  add(k, n) {
    const x = amount(this[k]) + n;
    assert(x >= 0n && x < 2n ** 128n, 'global accounting underflow');
    this[k] = x.toString();
  }
  local(m, k, n) {
    const x = amount(m[k]) + n;
    assert(x >= 0n && x < 2n ** 128n, 'mandate accounting underflow');
    m[k] = x.toString();
  }
  money(m, k, n) {
    assert(k === 'funded' || MONEY.includes(k), 'financial field required');
    this.local(m, k, n);
    this.add(k, n);
  }
  conserved(m) {
    const check = o => assert(amount(o.funded) === MONEY.reduce((n, k) => n + amount(o[k]), 0n), 'money conservation failed');
    check(this);
    assert(amount(this.storage_collected) === amount(this.allocated_bytes) * this.storagePrice(), 'funded storage accounting mismatch');
    if (m) {
      check(m);
      assert(m.unassigned_slots === m.slot_count - m.job_count && m.slot_count >= 1 && m.slot_count <= 8, 'permanent prepaid slots mismatch');
      assert(amount(m.storage_allocation_bytes) === ['base', 'assignment', 'delivery'].reduce((n, b) => n + amount(m[b + '_allocation_bytes']), 0n) && amount(m.storage_remaining_bytes) === ['base', 'assignment', 'delivery'].reduce((n, b) => n + amount(m[b + '_remaining_bytes']), 0n), 'mandate bucket conservation failed');
      let a = BigInt(m.unassigned_slots) * ASSIGNMENT_ALLOCATION,
        d = BigInt(m.unassigned_slots) * DELIVERY_ALLOCATION;
      for (let i = 0; i < m.job_count; i++) {
        const key = storageRead('job-index:' + m.id + ':' + i);
        assert(key !== null, 'original job index required');
        const j = this.getJob(m, key.trim());
        assert(amount(j.assignment_remaining_bytes) <= ASSIGNMENT_ALLOCATION && amount(j.delivery_remaining_bytes) <= DELIVERY_ALLOCATION, 'per-job storage quota exceeded');
        a += amount(j.assignment_remaining_bytes);
        d += amount(j.delivery_remaining_bytes);
      }
      assert(a === amount(m.assignment_remaining_bytes) && d === amount(m.delivery_remaining_bytes), 'assigned/unassigned job storage mismatch');
    }
  }
  held() {
    return amount(this.available) + amount(this.escrow) + amount(this.owner_credit) + amount(this.provider_credit);
  }
  retained() {
    return (storageUsage() + amount(this.reserved_bytes) + CUSHION) * this.storagePrice();
  }
  backed() {
    return accountBalance() >= this.retained() + this.held();
  }
  solvent() {
    this.conserved();
    assert(this.backed(), 'aggregate held/storage backing unavailable');
  }
  beforeDeposit() {
    const d = attachedDeposit(),
      b = accountBalance();
    assert(b >= d && b - d >= this.retained() + this.held(), 'incoming deposit cannot bail out existing backing deficit');
  }
  key(mid) {
    commitment(mid);
    return 'mandate:' + mid;
  }
  get(mid) {
    const raw = storageRead(this.key(mid));
    assert(raw !== null, 'mandate missing');
    return JSON.parse(raw);
  }
  allocate(m, bytes, bucket = 'base') {
    assert(['base', 'assignment', 'delivery'].includes(bucket), 'storage bucket required');
    this.local(m, bucket + '_allocation_bytes', bytes);
    this.local(m, bucket + '_remaining_bytes', bytes);
    this.local(m, 'storage_allocation_bytes', bytes);
    this.local(m, 'storage_remaining_bytes', bytes);
    this.add('allocated_bytes', bytes);
    this.add('reserved_bytes', bytes);
  }
  putBase(m, key, value, pad) {
    const size = encode(value).length;
    assert(size <= pad, 'record byte bound');
    const before = storageUsage();
    storageWrite(key, value + ' '.repeat(pad - size));
    const delta = storageUsage() - before;
    assert(delta >= 0n && delta <= amount(m.base_remaining_bytes), 'own base storage reservation exhausted');
    this.local(m, 'base_remaining_bytes', -delta);
    this.local(m, 'storage_remaining_bytes', -delta);
    this.add('reserved_bytes', -delta);
  }
  save(m) {
    this.putBase(m, this.key(m.id), JSON.stringify(m), MANDATE_BYTES);
  }
  finish(m, backing = true) {
    this.save(m);
    this.conserved(m);
    if (backing) this.solvent();
    return m;
  }
  jobKey(m, jid) {
    assert(typeof jid === 'string' && /^[a-z][a-z0-9_-]{0,27}$/.test(jid), 'bounded job ID');
    return 'job:' + m.id + ':' + jid;
  }
  getJob(m, jid) {
    const raw = storageRead(this.jobKey(m, jid));
    assert(raw !== null, 'job missing');
    const j = JSON.parse(raw);
    assert(j.mandate_id === m.id, 'job mandate mismatch');
    return j;
  }
  packet(m, jid, kind) {
    this.jobKey(m, jid);
    assert(['assignment', 'delivery'].includes(kind), 'packet kind required');
    const raw = storageRead(kind + ':' + m.id + ':' + jid);
    return raw === null ? null : JSON.parse(raw);
  }
  putPacket(m, j, kind, value) {
    assert(['assignment', 'delivery'].includes(kind), 'packet bucket required');
    const pad = kind === 'assignment' ? ASSIGNMENT_BYTES : DELIVERY_BYTES,
      raw = JSON.stringify(value),
      size = encode(raw).length;
    assert(size <= pad, 'packet byte bound');
    const before = storageUsage();
    storageWrite(kind + ':' + m.id + ':' + j.id, raw + ' '.repeat(pad - size));
    const delta = storageUsage() - before,
      key = kind + '_remaining_bytes';
    assert(delta >= 0n && delta <= amount(j[key]) && delta <= amount(m[key]), 'own job packet storage exhausted');
    j[key] = (amount(j[key]) - delta).toString();
    this.local(m, key, -delta);
    this.local(m, 'storage_remaining_bytes', -delta);
    this.add('reserved_bytes', -delta);
  }
  assignment({
    mandate_id,
    job_id
  }) {
    return this.packet(this.get(mandate_id), job_id, 'assignment');
  }
  delivery_record({
    mandate_id,
    job_id
  }) {
    return this.packet(this.get(mandate_id), job_id, 'delivery');
  }
  publish_assignment(v) {
    exact(v, ['mandate_id', 'job_id', 'assignment', 'public_share_ack']);
    this.zero();
    const m = this.get(v.mandate_id);
    this.direct(m.owner);
    const j = this.getJob(m, v.job_id),
      packet = validateAssignment(v.assignment, m, j),
      old = this.packet(m, j.id, 'assignment');
    assert(v.public_share_ack === PUBLIC_ACK, 'exact permanent public brief acknowledgement required');
    if (old) {
      assert(j.assignment_sha256 === packet.assignment_sha256 && JSON.stringify(old) === JSON.stringify(packet), 'immutable original assignment conflict');
      return {
        duplicate: true,
        assignment: old
      };
    }
    this.active(m);
    assert(j.status === 'open' && j.bids.length === 0 && this.now() < time(j.bid_by), 'owner assignment must precede bids');
    this.solvent();
    this.putPacket(m, j, 'assignment', packet);
    j.assignment_sha256 = packet.assignment_sha256;
    this.saveJob(m, j);
    this.finish(m);
    return {
      duplicate: false,
      assignment: packet
    };
  }
  saveJob(m, j) {
    assert(j.mandate_id === m.id, 'job mandate mismatch');
    this.putBase(m, this.jobKey(m, j.id), JSON.stringify(j), JOB_BYTES);
  }
  transfer(m, tid) {
    id(tid);
    const raw = storageRead('transfer:' + m.id + ':' + tid);
    if (raw === null) return null;
    const t = JSON.parse(raw);
    assert(t.mandate_id === m.id, 'transfer mandate mismatch');
    return t;
  }
  saveTransfer(m, t) {
    assert(t.mandate_id === m.id, 'transfer mandate mismatch');
    id(t.id);
    this.putBase(m, 'transfer:' + m.id + ':' + t.id, JSON.stringify(t), TRANSFER_BYTES);
  }
  active(m) {
    assert(!this.frozen && !m.frozen && !m.closed && this.now() < time(m.policy.expires_at), 'new mandate activity frozen, closed or expired');
  }
  terminal(m, j, status) {
    assert(m.open_jobs > 0, 'open jobs underflow');
    m.open_jobs--;
    j.status = status;
  }
  refund(m, j, status) {
    assert(['awarded', 'claimed', 'delivered'].includes(j.status), 'unsettled job required');
    const n = amount(j.price);
    this.money(m, 'escrow', -n);
    this.money(m, 'owner_credit', n);
    this.terminal(m, j, status);
    this.saveJob(m, j);
    this.finish(m);
    return j;
  }
  policy(owner, p) {
    exact(p, ['company_id', 'goal_id', 'plan_sha256', 'operator', 'providers', 'steps', 'max_cycles', 'per_job', 'daily', 'lifetime', 'max_open', 'expires_at', 'bid_seconds', 'delivery_seconds', 'review_seconds', 'acceptance', 'operator_service_fee', 'network', 'recipient_policy', 'assignment_mode']);
    network(p.network);
    recipients(p.recipient_policy, owner, p.operator);
    assert(p.assignment_mode === 'owner_public_text_v1', 'explicit owner public assignment mode required');
    assert(validateAccountId(owner) && owner !== currentAccountId(), 'external original owner required');
    assert(validateAccountId(p.company_id) && validateAccountId(p.operator) && ![owner, currentAccountId()].includes(p.operator), 'company/distinct operator required');
    id(p.goal_id);
    commitment(p.plan_sha256);
    assert(Array.isArray(p.providers) && p.providers.length >= 1 && p.providers.length <= 4 && new Set(p.providers).size === p.providers.length, 'bounded provider allowlist');
    for (const a of p.providers) assert(validateAccountId(a) && ![owner, p.operator, currentAccountId()].includes(a), 'distinct provider required');
    assert(Array.isArray(p.steps) && p.steps.length >= 1 && p.steps.length <= 4 && new Set(p.steps.map(s => s.id)).size === p.steps.length, 'bounded unique steps');
    for (const s of p.steps) {
      exact(s, ['id', 'kind', 'scope_sha256', 'criteria_sha256']);
      id(s.id);
      id(s.kind);
      commitment(s.scope_sha256);
      commitment(s.criteria_sha256);
    }
    integer(p.max_cycles, 1, 8);
    integer(p.max_open, 1, 8);
    integer(p.bid_seconds, 60, 86400);
    integer(p.delivery_seconds, 60, 86400);
    integer(p.review_seconds, 60, 86400);
    const per = amount(p.per_job),
      day = amount(p.daily),
      life = amount(p.lifetime);
    assert(per > 0n && per <= N && day >= per && life >= day && life <= 8n * N, 'bounded budgets');
    assert(time(p.expires_at) > this.now() + BigInt(p.bid_seconds + p.delivery_seconds + p.review_seconds) && time(p.expires_at) <= this.now() + 604800n, 'bounded expiry');
    assert(p.acceptance === ACCEPTANCE && p.operator_service_fee === '0', 'explicit owner award/delivery and zero service fee required');
  }
  derived(owner, client_id) {
    id(client_id);
    return hash(JSON.stringify([PROFILE, owner, client_id]));
  }
  policyHash(mid, owner, p) {
    return hash(JSON.stringify([PROFILE, currentAccountId(), mid, owner, p.company_id, p.goal_id, p.plan_sha256, p.operator, p.providers, p.steps.map(s => [s.id, s.kind, s.scope_sha256, s.criteria_sha256]), p.max_cycles, p.per_job, p.daily, p.lifetime, p.max_open, p.expires_at, p.bid_seconds, p.delivery_seconds, p.review_seconds, p.acceptance, p.operator_service_fee, p.network.chain_id, p.network.genesis_hash, p.network.registry_code_hash, p.assignment_mode, recipientHash(p.recipient_policy)]));
  }
  init_registry({
    admin
  }) {
    this.zero();
    assert(this.admin === '' && validateAccountId(admin), 'new registry/admin required');
    this.direct(admin);
    this.admin = admin;
    assert(accountBalance() >= (storageUsage() + ROOT_RESERVE + CUSHION) * this.storagePrice(), 'project must prepay code/root/cushion backing');
    return this.registry_state();
  }
  registry_state() {
    this.conserved();
    return {
      profile: PROFILE,
      contract_id: currentAccountId(),
      admin: this.admin,
      frozen: this.frozen,
      mandate_count: this.mandate_count,
      max_mandates: MAX_MANDATES,
      funded: this.funded,
      available: this.available,
      escrow: this.escrow,
      owner_credit: this.owner_credit,
      provider_credit: this.provider_credit,
      transfer_pending: this.transfer_pending,
      owner_paid: this.owner_paid,
      provider_paid: this.provider_paid,
      held: this.held().toString(),
      storage_collected: this.storage_collected,
      reserved_unused_bytes: this.reserved_bytes,
      allocated_bytes: this.allocated_bytes,
      required_retained: this.retained().toString(),
      account_balance: accountBalance().toString(),
      backed: this.backed(),
      pending_excluded_from_held: true,
      root_cushion_bytes: CUSHION.toString(),
      root_initial_reserve_bytes: ROOT_RESERVE.toString(),
      base_mandate_allocation_bytes: ALLOCATION.toString(),
      assignment_slot_bytes: ASSIGNMENT_ALLOCATION.toString(),
      delivery_slot_bytes: DELIVERY_ALLOCATION.toString(),
      provider_delivery_deposit: '0',
      assignment_mode: 'owner_public_text_v1',
      max_jobs_per_mandate: MAX_JOBS,
      extra_record_bytes: EXTRA.toString(),
      operator_service_fee: '0',
      admin_can_withdraw: false,
      assumed_storage_byte_cost: SUPPORTED_STORAGE_BYTE_COST.toString(),
      fresh_external_protocol_price_guard_required: true,
      contract_can_detect_protocol_price_change: false,
      external_company_dependency_verification: false,
      human_identity_verified: false,
      observed_at: this.now().toString()
    };
  }
  quote_create_mandate({
    owner,
    client_id,
    policy
  }) {
    this.policy(owner, policy);
    const mid = this.derived(owner, client_id),
      slots = Math.min(8, policy.steps.length * policy.max_cycles),
      assignment = BigInt(slots) * ASSIGNMENT_ALLOCATION,
      delivery = BigInt(slots) * DELIVERY_ALLOCATION,
      totalBytes = ALLOCATION + assignment + delivery,
      storage = totalBytes * this.storagePrice();
    return {
      profile: PROFILE,
      contract_id: currentAccountId(),
      owner,
      mandate_id: mid,
      policy_sha256: this.policyHash(mid, owner, policy),
      slot_count: slots,
      base_storage_bytes: ALLOCATION.toString(),
      assignment_storage_bytes: assignment.toString(),
      delivery_storage_bytes: delivery.toString(),
      storage_bytes: totalBytes.toString(),
      storage: storage.toString(),
      base_storage: (ALLOCATION * this.storagePrice()).toString(),
      assignment_storage: (assignment * this.storagePrice()).toString(),
      delivery_storage: (delivery * this.storagePrice()).toString(),
      provider_delivery_deposit: '0',
      business_budget: policy.lifetime,
      operator_service_fee: '0',
      total: (storage + amount(policy.lifetime)).toString(),
      project_code_charged_again: false,
      assumed_storage_byte_cost: SUPPORTED_STORAGE_BYTE_COST.toString(),
      fresh_external_protocol_price_guard_required: true,
      storage_refundable: false,
      ready: !this.frozen && this.mandate_count < MAX_MANDATES && storageRead(this.key(mid)) === null && this.backed(),
      observed_at: this.now().toString()
    };
  }
  create_mandate(v) {
    exact(v, ['client_id', 'policy', 'approved_storage', 'approved_budget', 'public_metadata_ack']);
    const owner = predecessorAccountId();
    this.direct(owner);
    const mid = this.derived(owner, v.client_id),
      old = storageRead(this.key(mid));
    if (old !== null) {
      const m = JSON.parse(old);
      exact(v.policy, Object.keys(m.policy));
      for (const step of v.policy.steps) exact(step, ['id', 'kind', 'scope_sha256', 'criteria_sha256']);
      assert(m.owner === owner && m.client_id === v.client_id && this.policyHash(mid, owner, v.policy) === m.policy_sha256 && v.approved_budget === m.funded, 'original mandate commitment conflict');
      assert(v.public_metadata_ack === true && v.approved_storage === '0' && attachedDeposit() === 0n, 'duplicate mandate inspection takes no fresh deposit');
      this.conserved(m);
      return {
        duplicate: true,
        mandate: m
      };
    }
    this.beforeDeposit();
    const q = this.quote_create_mandate({
      owner,
      client_id: v.client_id,
      policy: v.policy
    });
    assert(q.ready, 'new intake unavailable or original mandate already exists');
    assert(v.public_metadata_ack === true && v.approved_storage === q.storage && v.approved_budget === q.business_budget && attachedDeposit() === amount(q.total), 'exact own budget/storage approval required');
    const m = {
      id: q.mandate_id,
      client_id: v.client_id,
      owner,
      policy: v.policy,
      policy_sha256: q.policy_sha256,
      frozen: false,
      closed: false,
      job_count: 0,
      open_jobs: 0,
      owner_intents: 0,
      transfer_count: '0',
      funded: '0',
      available: '0',
      escrow: '0',
      owner_credit: '0',
      provider_credit: '0',
      transfer_pending: '0',
      owner_paid: '0',
      provider_paid: '0',
      lifetime_awarded: '0',
      day: '',
      day_awarded: '0',
      pending_transfer: '',
      storage_collected: q.storage,
      storage_allocation_bytes: '0',
      storage_remaining_bytes: '0',
      slot_count: q.slot_count,
      unassigned_slots: q.slot_count,
      base_allocation_bytes: '0',
      base_remaining_bytes: '0',
      assignment_allocation_bytes: '0',
      assignment_remaining_bytes: '0',
      delivery_allocation_bytes: '0',
      delivery_remaining_bytes: '0'
    };
    this.allocate(m, ALLOCATION);
    this.allocate(m, BigInt(q.slot_count) * ASSIGNMENT_ALLOCATION, 'assignment');
    this.allocate(m, BigInt(q.slot_count) * DELIVERY_ALLOCATION, 'delivery');
    this.money(m, 'funded', amount(q.business_budget));
    this.money(m, 'available', amount(q.business_budget));
    this.add('storage_collected', amount(q.storage));
    this.save(m);
    this.putBase(m, 'mandate-index:' + this.mandate_count, m.id, INDEX_BYTES);
    this.mandate_count++;
    return {
      duplicate: false,
      mandate: this.finish(m)
    };
  }
  mandate({
    mandate_id
  }) {
    const m = this.get(mandate_id);
    this.conserved(m);
    return m;
  }
  list_mandates({
    from_index = 0,
    limit = 8
  }) {
    integer(from_index, 0, MAX_MANDATES);
    integer(limit, 1, 8);
    const items = [];
    for (let i = from_index; i < Math.min(from_index + limit, this.mandate_count); i++) {
      const mid = storageRead('mandate-index:' + i);
      assert(mid !== null, 'mandate index missing');
      items.push(this.get(mid.trim()));
    }
    return {
      items,
      next_index: from_index + items.length < this.mandate_count ? from_index + items.length : null
    };
  }
  job({
    mandate_id,
    job_id
  }) {
    return this.getJob(this.get(mandate_id), job_id);
  }
  list_jobs({
    mandate_id,
    from_index = 0,
    limit = 8
  }) {
    const m = this.get(mandate_id);
    integer(from_index, 0, MAX_JOBS);
    integer(limit, 1, 8);
    const items = [];
    for (let i = from_index; i < Math.min(from_index + limit, m.job_count); i++) {
      const key = storageRead('job-index:' + m.id + ':' + i);
      assert(key !== null, 'job index missing');
      items.push(this.getJob(m, key.trim()));
    }
    return {
      items,
      next_index: from_index + items.length < m.job_count ? from_index + items.length : null
    };
  }
  transfer_status({
    mandate_id,
    transfer_id
  }) {
    return this.transfer(this.get(mandate_id), transfer_id);
  }
  post_job(v) {
    exact(v, ['mandate_id', 'step_id', 'cycle', 'policy_sha256']);
    this.zero();
    const m = this.get(v.mandate_id);
    this.direct(m.policy.operator);
    this.active(m);
    assert(v.policy_sha256 === m.policy_sha256, 'exact mandate policy');
    integer(v.cycle, 0, m.policy.max_cycles - 1);
    const step = m.policy.steps.find(s => s.id === v.step_id);
    assert(step, 'approved step required');
    const jid = step.id + '_' + v.cycle;
    assert(storageRead(this.jobKey(m, jid)) === null && m.job_count < m.slot_count && m.unassigned_slots > 0 && m.open_jobs < m.policy.max_open, 'original job/capacity refusal');
    assert(this.now() + BigInt(m.policy.bid_seconds + m.policy.delivery_seconds + m.policy.review_seconds) < time(m.policy.expires_at), 'insufficient mandate time');
    const j = {
      id: jid,
      mandate_id: m.id,
      step_id: step.id,
      cycle: v.cycle,
      kind: step.kind,
      scope_sha256: step.scope_sha256,
      criteria_sha256: step.criteria_sha256,
      status: 'open',
      created_at: this.now().toString(),
      bid_by: (this.now() + BigInt(m.policy.bid_seconds)).toString(),
      complete_by: null,
      review_by: null,
      bids: [],
      provider: null,
      price: '0',
      bid_sha256: null,
      dependency_sha256: null,
      award_approval_sha256: null,
      delivery_sha256: null,
      acceptance_sha256: null,
      credit: '0',
      paid: '0',
      transfer_id: null,
      intents: 0,
      assignment_sha256: null,
      assignment_remaining_bytes: ASSIGNMENT_ALLOCATION.toString(),
      delivery_remaining_bytes: DELIVERY_ALLOCATION.toString()
    };
    this.saveJob(m, j);
    this.putBase(m, 'job-index:' + m.id + ':' + m.job_count, j.id, INDEX_BYTES);
    m.job_count++;
    m.open_jobs++;
    m.unassigned_slots--;
    this.finish(m);
    return j;
  }
  bid(v) {
    exact(v, ['mandate_id', 'job_id', 'price', 'terms_sha256', 'scope_sha256', 'assignment_sha256']);
    this.zero();
    const m = this.get(v.mandate_id);
    this.active(m);
    const provider = predecessorAccountId();
    this.direct(provider);
    assert(m.policy.providers.includes(provider), 'allowed provider required');
    const j = this.getJob(m, v.job_id);
    assert(j.assignment_sha256 !== null && v.assignment_sha256 === j.assignment_sha256 && this.packet(m, j.id, 'assignment') !== null, 'original readable assignment required before bid');
    assert(j.status === 'open' && this.now() < time(j.bid_by) && j.bids.length < MAX_BIDS && !j.bids.some(b => b.provider === provider), 'new unexpired bid required');
    commitment(v.terms_sha256);
    assert(v.scope_sha256 === j.scope_sha256, 'exact scope');
    const n = amount(v.price);
    assert(n > 0n && n <= amount(m.policy.per_job), 'per-job cap');
    const b = {
      provider,
      price: v.price,
      terms_sha256: v.terms_sha256,
      bid_sha256: hash(JSON.stringify([PROFILE, currentAccountId(), m.id, m.policy_sha256, j.id, j.assignment_sha256, j.scope_sha256, j.criteria_sha256, provider, v.price, v.terms_sha256, j.bid_by]))
    };
    j.bids.push(b);
    this.saveJob(m, j);
    this.finish(m);
    return b;
  }
  approve_award(v) {
    exact(v, ['mandate_id', 'job_id', 'bid_sha256', 'policy_sha256', 'dependency_sha256', 'assignment_sha256']);
    this.zero();
    const m = this.get(v.mandate_id);
    this.direct(m.owner);
    this.active(m);
    assert(v.policy_sha256 === m.policy_sha256 && m.pending_transfer === '', 'exact policy/no own unknown transfer');
    commitment(v.dependency_sha256);
    const j = this.getJob(m, v.job_id);
    assert(j.status === 'open' && this.now() < time(j.bid_by) && j.assignment_sha256 !== null && v.assignment_sha256 === j.assignment_sha256, 'open unexpired exact assignment');
    const b = j.bids.find(b => b.bid_sha256 === v.bid_sha256);
    assert(b && m.policy.providers.includes(b.provider), 'exact signed bid');
    const n = amount(b.price),
      day = (this.now() / 86400n).toString(),
      spent = m.day === day ? amount(m.day_awarded) : 0n;
    assert(n <= amount(m.policy.per_job) && spent + n <= amount(m.policy.daily) && amount(m.lifetime_awarded) + n <= amount(m.policy.lifetime) && n <= amount(m.available), 'mandate budget cap');
    this.solvent();
    const complete = this.now() + BigInt(m.policy.delivery_seconds),
      review = complete + BigInt(m.policy.review_seconds);
    assert(review <= time(m.policy.expires_at), 'deadline exceeds mandate');
    m.day = day;
    m.day_awarded = (spent + n).toString();
    this.local(m, 'lifetime_awarded', n);
    this.money(m, 'available', -n);
    this.money(m, 'escrow', n);
    j.provider = b.provider;
    j.price = b.price;
    j.bid_sha256 = b.bid_sha256;
    j.complete_by = complete.toString();
    j.review_by = review.toString();
    j.dependency_sha256 = v.dependency_sha256;
    j.award_approval_sha256 = hash(JSON.stringify([PROFILE, m.id, m.policy_sha256, j.id, j.assignment_sha256, j.bid_sha256, j.dependency_sha256, m.owner]));
    j.status = 'awarded';
    this.saveJob(m, j);
    this.finish(m);
    return j;
  }
  claim({
    mandate_id,
    job_id
  }) {
    this.zero();
    const m = this.get(mandate_id),
      j = this.getJob(m, job_id);
    assert(j.provider, 'provider required');
    this.direct(j.provider);
    assert(j.status === 'awarded' && this.now() < time(j.complete_by), 'unexpired awarded job');
    j.status = 'claimed';
    this.saveJob(m, j);
    this.finish(m);
    return j;
  }
  deliver_encrypted(v) {
    exact(v, ['mandate_id', 'job_id', 'delivery']);
    this.zero();
    const m = this.get(v.mandate_id),
      j = this.getJob(m, v.job_id);
    assert(j.provider, 'original provider required');
    this.direct(j.provider);
    const packet = validateDelivery(v.delivery, m, j),
      old = this.packet(m, j.id, 'delivery');
    if (old) {
      assert(j.delivery_sha256 === packet.envelope_sha256 && JSON.stringify(old) === JSON.stringify(packet), 'immutable original encrypted delivery conflict');
      return {
        duplicate: true,
        delivery: old
      };
    }
    assert(j.status === 'claimed' && this.now() < time(j.complete_by), 'claimed before original deadline');
    this.solvent();
    this.putPacket(m, j, 'delivery', packet);
    j.delivery_sha256 = packet.envelope_sha256;
    j.status = 'delivered';
    this.saveJob(m, j);
    this.finish(m);
    return {
      duplicate: false,
      delivery: packet
    };
  }
  accept(v) {
    exact(v, ['mandate_id', 'job_id', 'delivery_sha256', 'assignment_sha256']);
    this.zero();
    const m = this.get(v.mandate_id);
    this.direct(m.owner);
    const j = this.getJob(m, v.job_id);
    assert(j.status === 'delivered' && j.delivery_sha256 === v.delivery_sha256 && j.assignment_sha256 === v.assignment_sha256 && this.packet(m, j.id, 'delivery') !== null && this.now() < time(j.review_by), 'exact delivered work in review window');
    const n = amount(j.price);
    this.money(m, 'escrow', -n);
    this.money(m, 'provider_credit', n);
    j.credit = j.price;
    j.acceptance_sha256 = hash(JSON.stringify([PROFILE, m.id, m.policy_sha256, j.id, j.assignment_sha256, j.provider, j.price, j.delivery_sha256, j.award_approval_sha256, m.owner]));
    this.terminal(m, j, 'accepted');
    this.saveJob(m, j);
    this.finish(m);
    return j;
  }
  cancel({
    mandate_id,
    job_id
  }) {
    this.zero();
    const m = this.get(mandate_id);
    this.direct(m.owner);
    const j = this.getJob(m, job_id);
    if (j.status === 'open') {
      this.terminal(m, j, 'cancelled');
      this.saveJob(m, j);
      this.finish(m);
      return j;
    }
    assert(j.status === 'awarded', 'owner cancel only before claim');
    return this.refund(m, j, 'cancelled');
  }
  provider_refund({
    mandate_id,
    job_id
  }) {
    this.zero();
    const m = this.get(mandate_id),
      j = this.getJob(m, job_id);
    assert(j.provider, 'provider required');
    this.direct(j.provider);
    return this.refund(m, j, 'refunded');
  }
  timeout({
    mandate_id,
    job_id
  }) {
    this.zero();
    const m = this.get(mandate_id),
      j = this.getJob(m, job_id);
    if (j.status === 'open') {
      assert(this.now() >= time(j.bid_by), 'bid deadline not reached');
      this.terminal(m, j, 'expired');
      this.saveJob(m, j);
      this.finish(m);
      return j;
    }
    assert(['awarded', 'claimed', 'delivered'].includes(j.status) && this.now() >= time(j.status === 'delivered' ? j.review_by : j.complete_by), 'unsettled deadline not reached');
    return this.refund(m, j, 'timed_out');
  }
  set_mandate_freeze({
    mandate_id,
    frozen
  }) {
    this.zero();
    const m = this.get(mandate_id);
    this.direct(m.owner);
    assert(typeof frozen === 'boolean', 'explicit freeze');
    m.frozen = frozen;
    return this.finish(m, !frozen);
  }
  close_mandate({
    mandate_id
  }) {
    this.zero();
    const m = this.get(mandate_id);
    this.direct(m.owner);
    assert(!m.closed, 'already closed');
    m.closed = true;
    const n = amount(m.available);
    this.money(m, 'available', -n);
    this.money(m, 'owner_credit', n);
    return this.finish(m);
  }
  set_registry_freeze({
    frozen
  }) {
    this.zero();
    this.direct(this.admin);
    assert(typeof frozen === 'boolean', 'explicit freeze');
    this.frozen = frozen;
    return this.registry_state();
  }
  quote_withdrawal({
    mandate_id,
    kind,
    job_id = ''
  }) {
    const m = this.get(mandate_id);
    assert(kind === 'owner' || kind === 'provider', 'original credit kind');
    const j = kind === 'provider' ? this.getJob(m, job_id) : null,
      prepaid = (kind === 'owner' ? m.owner_intents : j.intents) < (kind === 'owner' ? OWNER_SLOTS : JOB_SLOTS),
      bytes = prepaid ? 0n : EXTRA;
    return {
      profile: PROFILE,
      mandate_id: m.id,
      kind,
      job_id: j?.id ?? null,
      recipient: kind === 'owner' ? m.owner : j.provider,
      credit: kind === 'owner' ? m.owner_credit : j.credit,
      storage_bytes: bytes.toString(),
      storage: (bytes * this.storagePrice()).toString(),
      storage_refundable: false,
      assumed_storage_byte_cost: SUPPORTED_STORAGE_BYTE_COST.toString(),
      fresh_external_protocol_price_guard_required: true,
      ready: m.pending_transfer === '' && amount(kind === 'owner' ? m.owner_credit : j.credit) > 0n && this.backed()
    };
  }
  dispatch(m, kind, j, tid, n, approved_storage) {
    id(tid);
    const recipient = kind === 'owner' ? m.owner : j.provider,
      jid = j?.id ?? null,
      old = this.transfer(m, tid);
    if (old) {
      assert(old.kind === kind && old.job_id === jid && old.recipient === recipient && old.amount === n.toString(), 'immutable original transfer conflict');
      assert(approved_storage === '0' && attachedDeposit() === 0n, 'duplicate inspection has no fresh deposit');
      return {
        duplicate: true,
        transfer: old
      };
    }
    assert(m.pending_transfer === '' && n > 0n, 'own pending/unknown transfer or empty credit');
    assert(prepaidGas() >= 100000000000000n, 'callback gas required');
    assert((kind === 'owner' ? amount(m.owner_credit) : amount(j.credit)) === n, 'whole original credit');
    this.beforeDeposit();
    const q = this.quote_withdrawal({
      mandate_id: m.id,
      kind,
      job_id: jid ?? ''
    });
    assert(q.ready && approved_storage === q.storage && attachedDeposit() === amount(q.storage), 'exact own extra-storage approval');
    if (amount(q.storage) > 0n) {
      this.allocate(m, EXTRA);
      this.local(m, 'storage_collected', amount(q.storage));
      this.add('storage_collected', amount(q.storage));
    }
    const key = kind === 'owner' ? 'owner_credit' : 'provider_credit';
    this.money(m, key, -n);
    this.money(m, 'transfer_pending', n);
    if (j) {
      j.credit = '0';
      j.transfer_id = tid;
      if (j.intents < JOB_SLOTS) j.intents++;
      this.saveJob(m, j);
    } else if (m.owner_intents < OWNER_SLOTS) m.owner_intents++;
    const t = {
      id: tid,
      mandate_id: m.id,
      job_id: jid,
      kind,
      recipient,
      amount: n.toString(),
      status: 'pending',
      result: 'original_transfer_pending_or_unknown',
      storage_paid: q.storage
    };
    this.saveTransfer(m, t);
    this.local(m, 'transfer_count', 1n);
    m.pending_transfer = tid;
    this.finish(m);
    return NearPromise.new(recipient).transfer(n).then(NearPromise.new(currentAccountId()).functionCall('on_transfer', JSON.stringify({
      mandate_id: m.id,
      transfer_id: tid
    }), 0n, CALLBACK_GAS));
  }
  withdraw_owner(v) {
    exact(v, ['mandate_id', 'transfer_id', 'approved_amount', 'approved_storage']);
    const m = this.get(v.mandate_id);
    this.direct(m.owner);
    return this.dispatch(m, 'owner', null, v.transfer_id, amount(v.approved_amount), v.approved_storage);
  }
  withdraw_provider(v) {
    exact(v, ['mandate_id', 'job_id', 'transfer_id', 'approved_amount', 'approved_storage']);
    const m = this.get(v.mandate_id),
      j = this.getJob(m, v.job_id);
    assert(j.provider, 'provider required');
    this.direct(j.provider);
    return this.dispatch(m, 'provider', j, v.transfer_id, amount(v.approved_amount), v.approved_storage);
  }
  on_transfer({
    mandate_id,
    transfer_id
  }) {
    this.zero();
    assert(predecessorAccountId() === currentAccountId() && promiseResultsCount() === 1n, 'private original callback');
    const m = this.get(mandate_id),
      t = this.transfer(m, transfer_id);
    assert(t && t.status === 'pending' && m.pending_transfer === transfer_id, 'stale/wrong-mandate callback');
    let success = true;
    try {
      if (promiseResult(0n).length !== 0) return {
        status: 'pending',
        manual_review: true,
        mandate_id: m.id
      };
    } catch (_) {
      success = false;
    }
    const n = amount(t.amount),
      j = t.job_id ? this.getJob(m, t.job_id) : null;
    this.money(m, 'transfer_pending', -n);
    this.money(m, success ? t.kind === 'owner' ? 'owner_paid' : 'provider_paid' : t.kind === 'owner' ? 'owner_credit' : 'provider_credit', n);
    if (j) {
      if (success) {
        j.paid = (amount(j.paid) + n).toString();
        j.status = 'paid';
      } else j.credit = (amount(j.credit) + n).toString();
      this.saveJob(m, j);
    }
    t.status = success ? 'paid' : 'failed';
    t.result = success ? 'native_transfer_callback_succeeded' : 'known_failure_credit_restored_actual_backing_may_wait_for_refund';
    this.saveTransfer(m, t);
    m.pending_transfer = '';
    this.finish(m, false);
    return t;
  }
}, _applyDecoratedDescriptor(_class2.prototype, "assignment", [_dec2], Object.getOwnPropertyDescriptor(_class2.prototype, "assignment"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "delivery_record", [_dec3], Object.getOwnPropertyDescriptor(_class2.prototype, "delivery_record"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "publish_assignment", [_dec4], Object.getOwnPropertyDescriptor(_class2.prototype, "publish_assignment"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "init_registry", [_dec5], Object.getOwnPropertyDescriptor(_class2.prototype, "init_registry"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "registry_state", [_dec6], Object.getOwnPropertyDescriptor(_class2.prototype, "registry_state"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "quote_create_mandate", [_dec7], Object.getOwnPropertyDescriptor(_class2.prototype, "quote_create_mandate"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "create_mandate", [_dec8], Object.getOwnPropertyDescriptor(_class2.prototype, "create_mandate"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "mandate", [_dec9], Object.getOwnPropertyDescriptor(_class2.prototype, "mandate"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "list_mandates", [_dec0], Object.getOwnPropertyDescriptor(_class2.prototype, "list_mandates"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "job", [_dec1], Object.getOwnPropertyDescriptor(_class2.prototype, "job"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "list_jobs", [_dec10], Object.getOwnPropertyDescriptor(_class2.prototype, "list_jobs"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "transfer_status", [_dec11], Object.getOwnPropertyDescriptor(_class2.prototype, "transfer_status"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "post_job", [_dec12], Object.getOwnPropertyDescriptor(_class2.prototype, "post_job"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "bid", [_dec13], Object.getOwnPropertyDescriptor(_class2.prototype, "bid"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "approve_award", [_dec14], Object.getOwnPropertyDescriptor(_class2.prototype, "approve_award"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "claim", [_dec15], Object.getOwnPropertyDescriptor(_class2.prototype, "claim"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "deliver_encrypted", [_dec16], Object.getOwnPropertyDescriptor(_class2.prototype, "deliver_encrypted"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "accept", [_dec17], Object.getOwnPropertyDescriptor(_class2.prototype, "accept"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "cancel", [_dec18], Object.getOwnPropertyDescriptor(_class2.prototype, "cancel"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "provider_refund", [_dec19], Object.getOwnPropertyDescriptor(_class2.prototype, "provider_refund"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "timeout", [_dec20], Object.getOwnPropertyDescriptor(_class2.prototype, "timeout"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "set_mandate_freeze", [_dec21], Object.getOwnPropertyDescriptor(_class2.prototype, "set_mandate_freeze"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "close_mandate", [_dec22], Object.getOwnPropertyDescriptor(_class2.prototype, "close_mandate"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "set_registry_freeze", [_dec23], Object.getOwnPropertyDescriptor(_class2.prototype, "set_registry_freeze"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "quote_withdrawal", [_dec24], Object.getOwnPropertyDescriptor(_class2.prototype, "quote_withdrawal"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "withdraw_owner", [_dec25], Object.getOwnPropertyDescriptor(_class2.prototype, "withdraw_owner"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "withdraw_provider", [_dec26], Object.getOwnPropertyDescriptor(_class2.prototype, "withdraw_provider"), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, "on_transfer", [_dec27], Object.getOwnPropertyDescriptor(_class2.prototype, "on_transfer"), _class2.prototype), _class2)) || _class);
function on_transfer() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.on_transfer(_args);
  SharedProcurementV4._saveToStorage(_contract);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function withdraw_provider() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.withdraw_provider(_args);
  SharedProcurementV4._saveToStorage(_contract);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function withdraw_owner() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.withdraw_owner(_args);
  SharedProcurementV4._saveToStorage(_contract);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function quote_withdrawal() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.quote_withdrawal(_args);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function set_registry_freeze() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.set_registry_freeze(_args);
  SharedProcurementV4._saveToStorage(_contract);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function close_mandate() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.close_mandate(_args);
  SharedProcurementV4._saveToStorage(_contract);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function set_mandate_freeze() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.set_mandate_freeze(_args);
  SharedProcurementV4._saveToStorage(_contract);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function timeout() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.timeout(_args);
  SharedProcurementV4._saveToStorage(_contract);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function provider_refund() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.provider_refund(_args);
  SharedProcurementV4._saveToStorage(_contract);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function cancel() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.cancel(_args);
  SharedProcurementV4._saveToStorage(_contract);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function accept() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.accept(_args);
  SharedProcurementV4._saveToStorage(_contract);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function deliver_encrypted() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.deliver_encrypted(_args);
  SharedProcurementV4._saveToStorage(_contract);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function claim() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.claim(_args);
  SharedProcurementV4._saveToStorage(_contract);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function approve_award() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.approve_award(_args);
  SharedProcurementV4._saveToStorage(_contract);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function bid() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.bid(_args);
  SharedProcurementV4._saveToStorage(_contract);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function post_job() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.post_job(_args);
  SharedProcurementV4._saveToStorage(_contract);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function transfer_status() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.transfer_status(_args);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function list_jobs() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.list_jobs(_args);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function job() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.job(_args);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function list_mandates() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.list_mandates(_args);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function mandate() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.mandate(_args);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function create_mandate() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.create_mandate(_args);
  SharedProcurementV4._saveToStorage(_contract);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function quote_create_mandate() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.quote_create_mandate(_args);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function registry_state() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.registry_state(_args);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function init_registry() {
  const _state = SharedProcurementV4._getState();
  if (_state) {
    throw new Error("Contract already initialized");
  }
  const _contract = SharedProcurementV4._create();
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.init_registry(_args);
  SharedProcurementV4._saveToStorage(_contract);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function publish_assignment() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.publish_assignment(_args);
  SharedProcurementV4._saveToStorage(_contract);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function delivery_record() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.delivery_record(_args);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}
function assignment() {
  const _state = SharedProcurementV4._getState();
  if (!_state && SharedProcurementV4._requireInit()) {
    throw new Error("Contract must be initialized");
  }
  const _contract = SharedProcurementV4._create();
  if (_state) {
    SharedProcurementV4._reconstruct(_contract, _state);
  }
  const _args = SharedProcurementV4._getArgs();
  const _result = _contract.assignment(_args);
  if (_result !== undefined) if (_result && _result.constructor && _result.constructor.name === "NearPromise") _result.onReturn();else env.value_return(SharedProcurementV4._serialize(_result, true));
}

export { accept, approve_award, assignment, bid, cancel, claim, close_mandate, create_mandate, deliver_encrypted, delivery_record, init_registry, job, list_jobs, list_mandates, mandate, on_transfer, post_job, provider_refund, publish_assignment, quote_create_mandate, quote_withdrawal, registry_state, set_mandate_freeze, set_registry_freeze, timeout, transfer_status, withdraw_owner, withdraw_provider };
//# sourceMappingURL=shared_procurement_v4.js.map
