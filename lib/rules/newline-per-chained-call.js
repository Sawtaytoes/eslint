/**
 * @fileoverview Rule to ensure newline per method call when chaining calls
 * @author Rajendra Patil
 * @author Burak Yigit Kaya
 */

"use strict";

const astUtils = require("./utils/ast-utils");

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

module.exports = {
    meta: {
        type: "layout",

        docs: {
            description: "require a newline after each call in a method chain",
            category: "Stylistic Issues",
            recommended: false,
            url: "https://eslint.org/docs/rules/newline-per-chained-call"
        },

        fixable: "whitespace",

        schema: [{
            oneOf: [{
                type: "object",
                properties: {
                    ignoreChainWithDepth: {
                        type: "integer",
                        minimum: 1
                    }
                },
                default: { ignoreChainWithDepth: 2 },
                additionalProperties: false
            }, {
                type: "object",
                properties: {
                    maxTotalChainDepth: {
                        type: "integer",
                        minimum: 0
                    }
                },
                default: { maxTotalChainDepth: null },
                additionalProperties: false
            }]
        }],

        messages: {
            expectedLineBreak: "Expected line break before `{{propertyName}}`."
        }
    },

    create(context) {
        const options = context.options[0] || {},
            ignoreChainWithDepth = options.ignoreChainWithDepth || 2,
            maxTotalChainDepth = options.maxTotalChainDepth || null;

        const isUsingMaxTotalChainDepth = maxTotalChainDepth !== null;

        const sourceCode = context.getSourceCode();

        /**
         * Get the prefix of a given MemberExpression node.
         * If the MemberExpression node is a computed value it returns a
         * left bracket. If not it returns a period.
         * @param  {ASTNode} node A MemberExpression node to get
         * @returns {string} The prefix of the node.
         */
        function getPrefix(node) {
            return node.computed ? "[" : ".";
        }

        /**
         * Gets the property text of a given MemberExpression node.
         * If the text is multiline, this returns only the first line.
         * @param {ASTNode} node A MemberExpression node to get.
         * @returns {string} The property text of the node.
         */
        function getPropertyText(node) {
            const prefix = getPrefix(node);
            const lines = sourceCode.getText(node.property).split(astUtils.LINEBREAK_MATCHER);
            const suffix = node.computed && lines.length === 1 ? "]" : "";

            return prefix + lines[0] + suffix;
        }

        /**
         * Checks if the object and property of a given MemberExpression node are on the same line.
         * @param {ASTNode} node A CallExpression node to validate.
         * @returns {bool} The result of the object and property being on the same line.
         */
        function hasObjectAndPropertyOnSameLine({ object, property }) {
            return (
                astUtils.isTokenOnSameLine(
                    object,
                    property
                )
            );
        }

        /**
         * Reports when the CallExpression count on the same line is more than the ignore depth.
         * @param {ASTNode} node A MemberExpression node to get.
         * @returns {void} The result of the object and property being on the same line.
         */
        function validateCallExpressionIgnoreDepth(node) {
            const callee = node.callee;
            let parent = callee.object;
            let depth = 1;

            while (parent && parent.callee) {
                depth += 1;
                parent = parent.callee.object;
            }

            if (
                depth > ignoreChainWithDepth &&
                hasObjectAndPropertyOnSameLine(callee)
            ) {
                context.report({
                    node: callee.property,
                    loc: callee.property.loc.start,
                    messageId: "expectedLineBreak",
                    data: {
                        propertyName: getPropertyText(callee)
                    },
                    fix(fixer) {
                        const firstTokenAfterObject = sourceCode.getTokenAfter(callee.object, astUtils.isNotClosingParenToken);

                        return fixer.insertTextBefore(firstTokenAfterObject, "\n");
                    }
                });
            }
        }

        /**
         * Reports when the MemberExpression count is greater than the max total when any two nodes are on the same line.
         * @param {ASTNode} node A MemberExpression or CallExpression node to validate.
         * @returns {void} The result of the object and property being on the same line.
         */
        function validateMaxTotalChainDepth(node) {
            if (
                node.parent &&
                node.parent.type !== "CallExpression" &&
                node.parent.type !== "MemberExpression"
            ) {
                const memberExpressions = [];

                let currentNode = (
                    node.type === "CallExpression"
                        ? node.callee
                        : node
                );

                while (
                    currentNode.type === "CallExpression" ||
                    currentNode.type === "MemberExpression"
                ) {
                    if (currentNode.type === "MemberExpression") {
                        if (
                            currentNode.property.type === "Identifier" &&
                            !currentNode.computed
                        ) {
                            memberExpressions.push(currentNode);
                        }

                        currentNode = currentNode.object;
                    } else if (currentNode.type === "CallExpression") {
                        currentNode = currentNode.callee;
                    } else {
                        break;
                    }
                }

                if (
                    memberExpressions.length > maxTotalChainDepth &&
                    memberExpressions.some(hasObjectAndPropertyOnSameLine)
                ) {
                    memberExpressions
                        .filter(hasObjectAndPropertyOnSameLine)
                        .forEach(memberExpression => {
                            context.report({
                                node: memberExpression.property,
                                loc: memberExpression.property.loc.start,
                                messageId: "expectedLineBreak",
                                data: {
                                    propertyName: getPropertyText(memberExpression)
                                },
                                fix(fixer) {
                                    const firstTokenAfterObject = sourceCode.getTokenAfter(memberExpression.object, astUtils.isNotClosingParenToken);

                                    return fixer.insertTextBefore(firstTokenAfterObject, "\n");
                                }
                            });
                        });
                }
            }
        }

        return {
            "CallExpression:exit"(node) {
                if (!node.callee || node.callee.type !== "MemberExpression") {
                    return;
                }

                if (isUsingMaxTotalChainDepth) {
                    validateMaxTotalChainDepth(node);
                } else {
                    validateCallExpressionIgnoreDepth(node);
                }
            },

            "MemberExpression:exit"(node) {
                if (!isUsingMaxTotalChainDepth) {
                    return;
                }

                validateMaxTotalChainDepth(node);
            }
        };
    }
};
