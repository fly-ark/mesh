'use strict';

// Lists of possible types:
// https://github.com/benjamn/ast-types/blob/master/def/core.js
// https://github.com/benjamn/ast-types/blob/master/def/es6.js

const ALL = "ALL";

const triage_table = [

    {nodetype: 'ObjectExpression', prototype: ALL, typeof: ALL, isTable: true, fn: "table_rw"},
    {nodetype: ALL, prototype: ALL, typeof: 'Array', isTable: true, fn: "table_ro"},

    // removed 'rw' for now - need to figure out whether object and array literals should stay
    // consider *not* allowing them (just read-only) because of difficulties
    // in dealing with spread notation
    // TODO consider whether this will deal with array spread notation
    // [1, 2, 3]
    {nodetype: 'ArrayExpression', prototype: ALL, typeof: ALL, fn: "array_ro"},

    // TODO consider whether this will deal with object spread notation
    // {hello: 'world'}
    {nodetype: 'ObjectExpression', prototype: ALL, typeof: ALL, fn: "object_ro"},

    // some_fn()
    // TODO need to enumerate the other built-in objects here too... eg Map, Set
    {nodetype: 'CallExpression', prototype: Array.prototype, typeof: ALL, fn: "array_ro"},
    {nodetype: 'CallExpression', prototype: ALL, typeof: 'object', fn: "object_ro"},
    // If above isn't capturing things some objects, see http://stackoverflow.com/a/22482737

    // TODO what are MemberExpressions? Provide example in comments
    // TODO need to enumerate the other built-in objects here too... eg Map, Set
    {nodetype: 'MemberExpression', prototype: Array.prototype, typeof: ALL, fn: "array_ro",},
    {nodetype: 'MemberExpression', prototype: ALL, typeof: 'object', fn: "object_ro",},
    // If above isn't capturing things some objects, see http://stackoverflow.com/a/22482737

    {nodetype: 'NewExpression', prototype: ALL, typeof: 'object', fn: "object_ro",},
    /*
    // TO add a 'callee' column to the above records?
    // new Array([...])
    {nodetype: 'NewExpression', isPrototypeOf: ALL, typeof: ALL, fn: "array_rw",}
    
    // 'Hello world'
    {nodetype: 'Literal', prototype: ALL, typeof: ALL, fn: "value"},
    // -123
    {nodetype: 'UnaryExpression', prototype: ALL, typeof: ALL, fn: "value"},
    // undefined
    {nodetype: 'Identifier', prototype: ALL, typeof: ALL, fn: "value"},
    // 1 + 2
    {nodetype: 'BinaryExpression', prototype: ALL, typeof: ALL, fn: "value"},
    {nodetype: 'ExpressionStatement', prototype: ALL, typeof: ALL, fn: "value"},
    // `Hello ${name}`
    {nodetype: 'TemplateLiteral', prototype: ALL, typeof: ALL, fn: "value"},
    // (x) => x + 2
    {nodetype: 'ArrowFunctionExpression', prototype: ALL, typeof: ALL, fn: "value"},
    // TO what else is covered by this?
    // get sum() { return 1 + 2; }
    {nodetype: 'FunctionExpression', prototype: ALL, typeof: ALL, fn: "value"},
    // others
    {nodetype: 'MemberExpression', prototype: ALL, typeof: 'function', fn: "value"},
    {nodetype: 'CallExpression', prototype: ALL, typeof: 'function', fn: "value"},
    {nodetype: 'MemberExpression', prototype: ALL, typeof: ALL, fn: "value"},
    {nodetype: 'CallExpression', prototype: ALL, typeof: ALL, fn: "value"},

    function newexpr_triage (value, value_nodepath, id) {
        const new_callee_= { 'Map': map, }
        const callee_name = value_nodepath.callee.name;
        let display_fn = value_ro; 
        if (new_callee_hasOwnProperty(callee_name)) {
            display_fn = new_callee_callee_name];
        }
    },
    */

];

function triage(nodetype, value, isTable) {
    let stop, return_value;
    triage_table.forEach(function(row) {
        if (!stop
            && ((row.nodetype === ALL) || (nodetype === row.nodetype))
            && ((row.prototype === ALL) || (row.prototype.isPrototypeOf(value)))
            && ((row.typeof === ALL) || (typeof value === row.typeof))
            && ((row.isTable === isTable) || (row.isTable === undefined))
        ) {
            stop = true;
            return_value = row.fn;
        }
    });
    return return_value !== undefined ? return_value : "value";
};

module.exports = { triage: triage };