'use strict';

const React = require('react');
const ReactDOM = require('react-dom');
const Redux = require('redux');
const CodeMirror = require('codemirror/lib/codemirror');
require('codemirror/addon/selection/active-line');
require('codemirror/mode/javascript/javascript');

const Events = require('./events');
const Reducers = require('./reducers');
const LINE_SEPARATOR = require('./settings').LINE_SEPARATOR;
const Selectors = require('./selectors');
const generate_cells = require('./generate_cells');
const CT = require('./code_transformers');

// Redux setup

const store = Redux.createStore(Reducers.app);

// React components 

const Grid = require('./react.grid');
const StatusBar = require('./react.status_bar');

// HTML elements

// Need to render now to get a reference to the grid
ReactDOM.render(
    React.createElement(Grid, store.getState()),
    document.getElementById('grid-container')
)
const HTML_elements = {
    formula_bar: document.getElementById('formula-bar'),
    grid_container: document.getElementById('grid-container'),
    grid: document.getElementById('grid'),
    code_editor: document.getElementById('code-editor'),
    status_bar: document.getElementById('status-bar'),
    filepicker: document.getElementById('open-file-manager'),
}

// Code editor (CodeMirror)

const codemirror_settings = {
    value: '',
    mode: "javascript",
    styleActiveLine: true,
    lineWrapping: true,
    lineNumbers: true,
    lineSeparator: LINE_SEPARATOR,
}

const code_editor = CodeMirror(HTML_elements.code_editor, codemirror_settings);

// Themes

const themes = {
    light: {css: 'light', codemirror: 'neo'},
    dark: {css: 'dark', codemirror: 'lesser-dark'},
}

function assign_theme(chosen_theme) {
    document.getElementById("theme-mesh")
        .href = "themes/" + themes[chosen_theme].css + ".css";
    document.getElementById("theme-codemirror")
        .href = "node_modules/codemirror/theme/" + themes[chosen_theme].codemirror + '.css';
    code_editor.setOption("theme", themes[chosen_theme].codemirror);
}
let current_theme = 'dark';
assign_theme(current_theme);
ReactDOM.render(React.createElement(StatusBar, store.getState()), HTML_elements.status_bar);
const theme_button = document.getElementById("theme_changer");
theme_button.onclick = function () {
    current_theme = (current_theme === 'light') ? 'dark' : 'light';
    assign_theme(current_theme);
}

const code_pane_toggler = document.getElementById("code_pane_toggler");
code_pane_toggler.onclick = function() { store.dispatch({type: 'TOGGLE_CODE_PANE_SHOW'}) };

// Event bindings

Events.bind_window_events(store, window);
Events.bind_formula_bar_events(store, HTML_elements.formula_bar);
Events.bind_grid_events(store, HTML_elements.grid);
Events.bind_code_editor_events(store, code_editor);
Events.bind_load_file_events(store, HTML_elements.filepicker);

// App side-effects

function createWebWorkerFromText(text) {
    // https://stackoverflow.com/a/10372280/996380
    let blob;
    try {
        blob = new Blob([text], {type: 'application/javascript'});
    } catch (e) { // Backwards-compatibility
        blob = new BlobBuilder();
        blob.append(response);
        blob = blob.getBlob();
    }
    try {
        return new Worker(URL.createObjectURL(blob));
    } catch (e) {
        const worker = new Worker('Worker-helper.js');
        worker.postMessage(text);
        return worker;
    }
};

store.subscribe( function calculate () {
    const state = store.getState();
    const mode = state.mode;
    if (mode !== 'CALCULATING') return;

    const code = state.code_editor.value;
    // TODO consider adding AST check here
    const worker = createWebWorkerFromText(code);
    worker.onmessage = function(e) {
        
        /* SUCCESS */
        const results = e.data;
        const AST = CT.parse_code_string_to_AST(code);
        let cellsNodePath = CT.getCellsNodePath(AST);
        let cells = generate_cells(results, cellsNodePath);
        const new_cells = {};
        for (let k in cells) {
            const cell = cells[k];
            const cell_id = JSON.stringify(cell.location);
            new_cells[cell_id] = cell;
        };
        store.dispatch({ type: 'UPDATE_GRID', cells: new_cells });
        /* FAILURE */
        /*
            // TODO errors need to be caught *before* the code editor state changes
            // FAILURE
            alert(e);
            // TODO highlight offending code?
            console.error(e);
            // TODO right now this dumps the user back to the code editing pane,
            // but it should depend on where the commit came from (code pane or formula bar)
            // maybe this is indicated via the action? Actually - could probs get via undo/redo
            // Send mode to some error state
            return Object.assign({}, state, {
                mode: 'EDIT',
                selected_cell_loc: state.prev_selected_cell_loc,
                code_editor: Object.assign({}, state.code_editor, {value: state.code_editor.prev_value})
            });
        */
    };
    // worker.postMessage({action: "full"});
    worker.postMessage({});
    // TODO Give option to interrupt worker if it takes too long to calc
});

store.subscribe( function log_state () {
    console.log("State: ", store.getState());
});

store.subscribe( function update_page () {

    const state = store.getState();
        
    // Status bar
    // TODO should it *always* render?
    ReactDOM.render(React.createElement(StatusBar, state), HTML_elements.status_bar);

    // Grid
    if (state.mode === 'READY') {
        // TODO maybe we should return to having focus tracked in the app state?
        HTML_elements.grid.focus();
        ReactDOM.render(React.createElement(Grid, state), HTML_elements.grid_container);
    }
    
    // Formula bar
    if (state.mode === 'EDIT') {
        HTML_elements.formula_bar.focus();
    } else if (state.mode === 'EDIT_REPLACE') {
        HTML_elements.formula_bar.value = '';
        store.dispatch({ type: 'EDIT_CELL' });
    } else if (state.mode === 'READY') {
        const selected_cell = Selectors.get_selected_cell(state);
        HTML_elements.formula_bar.value = selected_cell.formula_bar_value;
    }

    // Code editor
    // can't we just make the events file know about the code editor?
    // (ie load the code directly into the event props from the HTML element
    // instead of loading it in via a subscription)
    if (state.mode === 'LOAD_CODE_FROM_PANE') {
        store.dispatch({ type: 'LOAD_CODE', code: code_editor.getValue() });
    } else if (state.mode === 'EDITING_CODE') {
        HTML_elements.code_editor.style.display = 'block';
    } else {
        HTML_elements.code_editor.style.display = state.code_editor.show ? 'block' : 'none';
        code_editor.setValue(state.code_editor.value);
    }
    // TODO setting this every time is probably slow - consider React-ising
    // or else doing only when a commit happens or something

});
store.dispatch({ type: 'RESET_STATE' });
