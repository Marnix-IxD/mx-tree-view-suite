const base = require("@mendix/pluggable-widgets-tools/configs/eslint.ts.base.json");

module.exports = {
    ...base,
    rules: {
        ...base.rules,
        // Allow unused vars that are prefixed with underscore
        "no-unused-vars": ["error", { 
            "argsIgnorePattern": "^_",
            "varsIgnorePattern": "^_",
            "caughtErrorsIgnorePattern": "^_"
        }],
        "@typescript-eslint/no-unused-vars": ["error", { 
            "argsIgnorePattern": "^_",
            "varsIgnorePattern": "^_",
            "caughtErrorsIgnorePattern": "^_"
        }],
        // React import is handled by the new JSX transform
        "react/react-in-jsx-scope": "off",
        // Allow unescaped entities in JSX (for quotes, apostrophes, etc.)
        "react/no-unescaped-entities": "off",
        // Member ordering can be too strict for complex classes
        "@typescript-eslint/member-ordering": "off",
        // Allow missing return types for simple functions
        "@typescript-eslint/explicit-function-return-type": ["warn", {
            "allowExpressions": true,
            "allowTypedFunctionExpressions": true,
            "allowHigherOrderFunctions": true,
            "allowDirectConstAssertionInArrowFunctions": true,
            "allowConciseArrowFunctionExpressionsStartingWithVoid": true
        }],
        // Allow exhaustive deps warnings (often too strict)
        "react-hooks/exhaustive-deps": "warn",
        // Allow Fragment shorthand syntax
        "react/jsx-fragments": ["error", "element"],
        // Console logs - allow debug, warn, and error
        "no-console": ["error", { "allow": ["debug", "warn", "error"] }]
    }
};
