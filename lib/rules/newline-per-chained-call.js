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
            type: "object",
            properties: {
                depthCalculationStyle: {
                    type: "string",
                    enum: ["all", "perLine"],
                    default: "perLine"
                },
                ignoreChainWithDepth: {
                    type: "integer",
                    minimum: 1
                },
                includeBrackets: {
                    type: "boolean",
                    default: true
                },
                includeMethodCalls: {
                    type: "boolean",
                    default: true
                },
                includeProperties: {
                    type: "boolean",
                    default: false
                }
            },
            default: { ignoreChainWithDepth: 2 },
            additionalProperties: false
        }],

        messages: {
            expectedLineBreak: "Expected line break before `{{propertyName}}`."
        }
    },

    create(context) {
        const options = context.options[0] || {},
            depthCalculationStyle = options.depthCalculationStyle || "perLine",
            ignoreChainWithDepth = options.ignoreChainWithDepth || 2,
            includeBrackets = options.includeBrackets || true,
            includeMethodCalls = options.includeMethodCalls || true,
            includeProperties = options.includeProperties || false;

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
         * Reports when CallExpression or MemberExpression count is greater than the max total when two nodes are on the same line.
         * @param {ASTNode} node A MemberExpression or CallExpression node to validate.
         * @returns {void} The result of the object and property being on the same line.
         */
        function validateChainDepth(node) {
            const closestMemberExpression = (
                node.type === "CallExpression"
                    ? node.callee
                    : node
            );

            const memberExpressions = [];

            let currentNode = node;

            while (
                currentNode.type === "CallExpression" ||
                currentNode.type === "MemberExpression"
            ) {
                if (
                    currentNode.type === "MemberExpression" && (
                        (
                            includeMethodCalls &&
                            currentNode.object.type === "CallExpression"
                        ) || (
                            includeProperties &&
                            currentNode.object.type !== "MemberExpression"
                        )
                    )
                ) {
                    if (
                        includeBrackets || (
                            currentNode.property.type === "Identifier" &&
                            !currentNode.computed
                        )
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

            // console.log(memberExpressions.map(x => x.property.name));

            if (
                depthCalculationStyle === "all" &&
                node.parent.type === "ExpressionStatement" &&
                memberExpressions.length > ignoreChainWithDepth &&
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
                                const firstTokenAfterObject = (
                                    sourceCode.getTokenAfter(
                                        memberExpression.object,
                                        astUtils.isNotClosingParenToken
                                    )
                                );

                                return fixer.insertTextBefore(firstTokenAfterObject, "\n");
                            }
                        });
                    });
            } else if (
                depthCalculationStyle === "perLine" &&
                memberExpressions.length > ignoreChainWithDepth &&
                hasObjectAndPropertyOnSameLine(closestMemberExpression)
            ) {
                context.report({
                    node: closestMemberExpression.property,
                    loc: closestMemberExpression.property.loc.start,
                    messageId: "expectedLineBreak",
                    data: {
                        propertyName: getPropertyText(closestMemberExpression)
                    },
                    fix(fixer) {
                        const firstTokenAfterObject = (
                            sourceCode.getTokenAfter(
                                closestMemberExpression.object,
                                astUtils.isNotClosingParenToken
                            )
                        );

                        return fixer.insertTextBefore(firstTokenAfterObject, "\n");
                    }
                });
            }
        }

        return {
            "CallExpression:exit"(node) {
                if (
                    !includeMethodCalls ||
                    (
                        node.callee &&
                        node.callee.type !== "MemberExpression"
                    )
                ) {
                    return;
                }

                // console.log("CallExpression:exit", node.callee.property.name);

                validateChainDepth(node);
            },

            "MemberExpression:exit"(node) {
                if (!includeProperties) {
                    return;
                }

                // console.log("MemberExpression:exit", node.property.name);

                validateChainDepth(node);
            }
        };
    }
};
