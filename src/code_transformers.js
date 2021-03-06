'use strict';

// On the choice of parser:
// https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API
// Alternative to Recast: https://github.com/facebook/pfff

// Useful:
// astexplorer.net

/* PRIVATE (setup) */

const Recast = require('recast');
const B = Recast.types.builders;

const LINE_SEPARATOR = require('./settings').LINE_SEPARATOR;
const RECAST_SETTINGS = { lineTerminator: LINE_SEPARATOR };

const fill = require('./settings').fill;

function makeUniqueID(existing_IDs, len) {
    // See also https://github.com/benjamn/private/blob/master/private.js#L49
    do {var new_ID = Math.random().toString(36).substr(2, len)}
    while (existing_IDs.has(new_ID));
    return new_ID;
};

// TODO should be an object or map
function getObjPropNodeNameProp(nodeType) {
    return (nodeType === 'Literal') ? 'value' : 'name';
};

// TODO write tests
// TODO make this take a nodepath instead?
function get_object_key_from_node(obj_key_node) {
    return obj_key_node[getObjPropNodeNameProp(obj_key_node.type)];
};

function parse_code_string_to_AST(code_string) {
    return Recast.parse(code_string, RECAST_SETTINGS);
};

function print_AST_to_code_string(AST) {
    return Recast.print(AST, RECAST_SETTINGS).code;
};

function getCellsNodePath(AST) {
    let nodepath_to_return;
    Recast.visit(AST, {
        visitVariableDeclarator: function(path) {
            // TODO put some variable decln type check here?
            if (path.node.id.name == '_CELLS') {
                nodepath_to_return = path;
                return false;
            }
            this.traverse(path);
        }
    });
    return nodepath_to_return.get('init');
};

function getCellNodePath(meshCellsNodePath, key) {
    // TODO Eventually should allow both Identifiers and Literals using getObjPropNodeNameProp
    const propsPath = meshCellsNodePath.get('properties');
    for (let i=0; i < propsPath.value.length; i++) {
        const propPath = propsPath.get(i);
        const cellName = get_object_key_from_node(propPath.node.key)
        if (cellName === key) {
            const cellProps = propPath.get("value", "properties");
            // TODO below is massive hack - should look at keys instead of assuming v is first
            let cellValueNodePath = cellProps.get(0, "value");
            if (cellValueNodePath.node.type === "FunctionExpression") {
                cellValueNodePath = cellValueNodePath.get("body", "body", 0, "argument")
            }
            return { property: propPath, value: cellValueNodePath, };
        };
    };
};

/* GENERAL */

// TODO write tests
function delete_container(value_path) {
    value_path.replace(B.literal(null));
};

/* ARRAY */

function insert_array_element(arr_path, element_num, inserted_text) {
    const elements_path = arr_path.get('elements');
    const inserted_node = B.identifier(inserted_text);
    if (elements_path.node.elements.length === 0) {
        elements_path.push(inserted_node);
    } else {
        elements_path.insertAt(element_num, inserted_node);
    }
};

function append_array_element(arr_path, inserted_text) {
    const elements_path = arr_path.get('elements');
    const inserted_node = B.identifier(inserted_text);
    elements_path.push(inserted_node);
};

function replace_array_element(arr_path, element_num, inserted_text) {
    const elements_path = arr_path.get('elements');
    elements_path.get(element_num).replace(B.identifier(inserted_text));
};

function remove_array_element(arr_path, element_num) {
    const element_path = arr_path.get('elements', element_num);
    element_path.prune();
};

/* OBJECT */

function get_object_item(obj_path, key) {
    const props_path = obj_path.get('properties');

    for (let i=0; i < props_path.value.length; i++) {
        let prop_path = props_path.get(i);
        let key_node = prop_path.node.key;
        if (get_object_key_from_node(key_node) === key) {
            return prop_path;
        }
    }
    return undefined;
};

function get_object_item_index(obj_path, key) {
    const props_path = obj_path.get('properties');

    for (let i=0; i < props_path.value.length; i++) {
        let prop_path = props_path.get(i);
        let key_node = prop_path.node.key;
        if (get_object_key_from_node(key_node) === key) {
            return i;
        }
    }
    return false;
};

// TODO: be smart about how the 'key' is created (id vs string literal)
function replace_object_item_key(obj_item_path, new_key_text) {
    // TODO throw error if duplicate key?
    obj_item_path.get('key').replace(B.identifier(new_key_text));
};

function replace_object_item_value(obj_item_path, new_value_text) {
    obj_item_path.get('value').replace(B.identifier(new_value_text));
};

function insert_object_item(obj_path, key_text, value_text, index) {
    // TODO throw error if duplicate key?
    const props_path = obj_path.get('properties');
    const new_prop_node = B.property('init', 
                            B.identifier(key_text), 
                            // TODO using this instead of literal is probably a massive hack
                            B.identifier(value_text));
    if (index === undefined || props_path.node.properties.length === 0) {
        props_path.push(new_prop_node);
    } else {
        props_path.insertAt(index, new_prop_node);
    }
};

function insert_object_getter(obj_path, key_text, body_text, index) {
    // TODO throw error if duplicate key?
    // TODO make these self-memoising?
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get#Smart_self-overwriting_lazy_getters
    const props_path = obj_path.get('properties');
    const function_body = B.blockStatement([
    // https://github.com/benjamn/ast-types/blob/master/def/core.js#L108
        // TODO insert the 'const this = sheet;' thing
        B.returnStatement(B.identifier(body_text))
    ]);
    const function_expression = B.functionExpression(null, [], function_body);
    const new_prop_node = B.property('get', 
                            B.identifier(key_text), 
                            function_expression);
    if (index === undefined || props_path.node.properties.length === 0) {
        props_path.push(new_prop_node);
    } else {
        props_path.insertAt(index, new_prop_node);
    }
};

function replace_object_getter_return_val(obj_getter_prop_path, new_return_value_text) {
    const val = obj_getter_prop_path.get('value', 'body', 'body', 0, 'argument');
    val.replace(B.identifier(new_return_value_text));
};

function remove_object_item(obj_path, key) {
    // TODO throw error if missing key?
    const props_path = obj_path.get('properties');
    if (props_path.value.length > 0) {
        for (let i=0; i < props_path.value.length; i++) {
            let prop_path = props_path.get(i);
            let key_node = prop_path.node.key;
            if (key === get_object_key_from_node(key_node, key)) {
                prop_path.prune();
            }
        }
    }
};

/* TABLE */

function Table_Create(cellObjPath) {
    const cellValuePropPath = get_object_item(cellObjPath, "v");
    const table_text = "function () {return _makeTable({})}";
    replace_object_item_value(cellValuePropPath, table_text);
    const cellTableFlagPropPath = get_object_item(cellObjPath, "t");
    if (cellTableFlagPropPath !== undefined) {
        replace_object_item_value(cellTableFlagPropPath, "true");
    } else {
        insert_object_item(cellObjPath, "t", "true")
    };
};

function Table_GetColumnNodePaths(tablePath) {
    const colNodePaths = {};
    const tablePropsPath = tablePath.get("properties");
    for (let i = 0; i < tablePropsPath.value.length; i++) {
        const propPath = tablePropsPath.get(i);
        const propValuePath = propPath.get("value");
        if (propValuePath.value.type === 'ObjectExpression') {
            const valuesPath = get_object_item(propValuePath, "values");
            const defaultPath = get_object_item(propValuePath, "default");
            if (valuesPath !== undefined && defaultPath !== undefined) {
                const heading = get_object_key_from_node(propPath.get("key").node);
                colNodePaths[heading] = propValuePath;
            };
        };
    };
    return colNodePaths;
};

function Table_ResizeArray(arrayPath, newSize) {
    // TODO shrink?
    const elementsNode = arrayPath.value.elements;
    const currentLength = elementsNode.length;
    const extraSlotCount = Math.max(newSize - currentLength, 0); // TODO remove if shrink
    for (let i = 0; i < extraSlotCount; i++) {
        elementsNode.push(B.identifier('undefined'));
    };
};

function Table_ChangeValueCell(tablePath, colHeading, index, new_value) {
    // TODO if values is a function call, fail?
    const colPath = get_object_item(tablePath, colHeading);
    const valuesPath = get_object_item(colPath.get("value"), "values").get("value");
    const currentLength = valuesPath.node.elements.length;
    if (currentLength < index + 1) { // Expand only, don't shrink
        Table_ResizeArray(valuesPath, index + 1);
    };
    replace_array_element(valuesPath, index, new_value);
};

function Table_AddColumn(tablePath, heading, colIndex) {
    // TODO should this not have heading as a parameter, and auto-generate it to be unique?
    const lengths = [], headings = new Set();
    const columnPaths = Table_GetColumnNodePaths(tablePath);
    for (let heading in columnPaths) {
        const colPath = columnPaths[heading];
        headings.add(heading);
        const valuesPath = get_object_item(colPath, "values");
        let valuesNode = valuesPath.get("value").node;
        if (valuesNode.type === "ArrayExpression") {
            lengths.push(valuesNode.elements.length);
        };
    };
    const MAX = function(a, b) {return Math.max(a, b);}
    const length = (lengths.length > 0) ? lengths.reduce(MAX, 0) : 0;
    const valuesProp = B.property('init', 
                        B.literal('values'),
    // TODO should it fill with holes instead?
    // TODO should the default value be a function that returns null or undefined?
    // That way we have a simpler template to work with for the UI
    // (or else we exclude the prop entirely), but may dirty up the source
                        B.arrayExpression(fill.call(new Array(length), B.identifier('undefined')))
    );
    const defaultProp = B.property('init', B.literal('default'), B.literal(null));
    const newObject = B.objectExpression([defaultProp, valuesProp]);
    let newHeading = heading;
    if (newHeading === undefined) newHeading = makeUniqueID(headings, 8);
    const newProp = B.property('init', B.literal(newHeading), newObject);

    const tablePropsPath = tablePath.get("properties");
    if (colIndex === undefined) colIndex = tablePropsPath.value.length;
    tablePropsPath.value.splice(colIndex, 0, newProp);
};

function Table_DeleteColumn(tablePath, heading) {
    const tablePropsPath = tablePath.get("properties");
    for (let i = 0; i < tablePropsPath.value.length; i++) {
        let propPath = tablePropsPath.get(i);
        let key = get_object_key_from_node(propPath.get("key").value);
        if (key === heading) {
            propPath.prune();
        }
    };
};

function Table_AddRow(tablePath, affectedColHeading, index, newValue) {
    const columnPaths = Table_GetColumnNodePaths(tablePath);
    for (let h in columnPaths) {
        const colPath = columnPaths[h];
        const valuesPath = get_object_item(colPath, "values");
        let valuesNode = valuesPath.get("value").node;
        if (valuesNode.type === "ArrayExpression") {
            if (h === affectedColHeading && newValue !== undefined) {
                valuesNode.elements.push(B.identifier(newValue));
            } else {
                valuesNode.elements.push(B.identifier("undefined"));
            }
        }
    };
};

function Table_DeleteRow(tablePath, index) {
    const columnPaths = Table_GetColumnNodePaths(tablePath);
    for (let h in columnPaths) {
        const colPath = columnPaths[h];
        const valuesPath = get_object_item(colPath, "values");
        let valuesNode = valuesPath.get("value").node;
        if (valuesNode.type === "ArrayExpression") {
            valuesPath.get("value", "elements", index).prune();
        }
    }
};
/*
Table_ChangeDefaultFormulaCell: function() {},
Table_Add: function() {}, // add tests for this?? Maybe not needed if just do to an empty object
Table_EditLength: function() {},
Table_DeleteLength: function() {}, // not sure
*/

function FunctionCall_GetArgument(functionCallNodePath, argIndex) {
    return functionCallNodePath.get("arguments", argIndex);
}

/* PUBLIC API */

module.exports = {

    makeUniqueID: makeUniqueID,

    get_object_key_from_node: get_object_key_from_node,
    parse_code_string_to_AST: parse_code_string_to_AST,
    print_AST_to_code_string: print_AST_to_code_string,
    getCellsNodePath: getCellsNodePath,
    getCellNodePath: getCellNodePath,
    delete_container: delete_container,

    insert_array_element: insert_array_element,
    append_array_element: append_array_element,
    replace_array_element: replace_array_element,
    remove_array_element: remove_array_element,

    get_object_item: get_object_item,
    get_object_item_index: get_object_item_index,
    replace_object_item_key: replace_object_item_key,
    replace_object_item_value: replace_object_item_value,
    insert_object_item: insert_object_item,
    insert_object_getter: insert_object_getter,
    replace_object_getter_return_val: replace_object_getter_return_val,
    remove_object_item: remove_object_item,

    Table_Create: Table_Create,
    Table_ChangeValueCell: Table_ChangeValueCell,
    Table_ResizeArray: Table_ResizeArray,
    Table_AddColumn: Table_AddColumn,
    Table_DeleteColumn: Table_DeleteColumn,
    Table_AddRow: Table_AddRow,
    Table_DeleteRow: Table_DeleteRow,

    FunctionCall_GetArgument: FunctionCall_GetArgument,

};
