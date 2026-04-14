"use strict";

(function () {
    function eachMatch(scope, selector, callback) {
        if (scope.matches && scope.matches(selector)) callback(scope);
        scope.querySelectorAll(selector).forEach(callback);
    }

    function addClasses(node, classNames) {
        if (!node || !classNames) return;
        classNames.split(" ").forEach((name) => {
            if (name) node.classList.add(name);
        });
    }

    function styleInputs(scope) {
        eachMatch(scope, "input:not([type='checkbox']):not([type='radio']):not([type='file']), textarea", (el) => {
            el.classList.add("form-control");
        });

        eachMatch(scope, "select", (el) => {
            el.classList.add("form-select");
        });
    }

    function styleButtons(scope) {
        eachMatch(scope, "button", (btn) => {
            addClasses(btn, "btn fw-semibold");
            if (btn.classList.contains("done")) addClasses(btn, "btn-primary");
            if (btn.classList.contains("add")) addClasses(btn, "btn-success");
            if (btn.classList.contains("delete")) addClasses(btn, "btn-danger");
            if (btn.classList.contains("filter-clear")) addClasses(btn, "btn-secondary");
            if (btn.classList.contains("icon-btn")) addClasses(btn, "btn-light");
        });
    }

    function styleCards(scope) {
        eachMatch(scope, ".card, .section-intro, .modal-card", (el) => {
            addClasses(el, "shadow-sm");
        });
    }

    function styleTables(scope) {
        eachMatch(scope, "table", (table) => {
            addClasses(table, "table table-hover table-striped align-middle");
        });
    }

    function styleHelpers(scope) {
        eachMatch(scope, ".filter-group small, .card small", (small) => {
            small.classList.add("form-text");
        });
        eachMatch(scope, ".item, .inline-actions, .button-group", (el) => {
            el.classList.add("gap-2");
        });
    }

    function enhance(scope) {
        if (!scope || scope.nodeType !== Node.ELEMENT_NODE) return;
        styleInputs(scope);
        styleButtons(scope);
        styleCards(scope);
        styleTables(scope);
        styleHelpers(scope);
    }

    function boot() {
        document.body.classList.add("bootstrap-ui");
        enhance(document.body);

        const observer = new MutationObserver((records) => {
            records.forEach((record) => {
                record.addedNodes.forEach((node) => {
                    if (node.nodeType !== Node.ELEMENT_NODE) return;
                    enhance(node);
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
