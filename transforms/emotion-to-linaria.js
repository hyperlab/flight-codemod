import { magenta, red } from "chalk";
import nodePath from "path";

export default function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);

  replaceCssPropSimple(root, j);
  const replaceClassNameErrors = replaceClassname(root, j) || [];
  replaceUiThemeImport(root, j, file.path);
  const replaceThemeErrors = replaceTheme(root, j, file.path);
  replaceStyledImport(root, j);
  removeCssArrowFns(root, j);

  const withComponentErrors = warnWithComponent(root, j);

  const errors = [
    ...replaceThemeErrors,
    ...replaceClassNameErrors,
    ...withComponentErrors,
  ];
  if (errors.length > 0) {
    errors.map((err) => {
      console.warn(
        `Manual edits needed in ${magenta(file.path)} on line ${magenta(
          err.line
        )}\n - ${red(err.msg)}`
      );
    });
  }

  return root.toSource({});
}

function warnWithComponent(root, j) {
  let errors = [];
  const withComponentUsage = root.find(j.MemberExpression, {
    property: { name: "withComponent" },
  });
  if (withComponentUsage.length > 0) {
    const line = withComponentUsage.get().value.loc.start.line;

    errors.push({
      line,
      msg: "withComponent is no longer supported",
    });
  }

  return errors;
}

function replaceCssPropSimple(root, j) {
  const cssProps = root.find(j.JSXIdentifier, { name: "css" });
  if (!cssProps.length > 0) return;

  cssProps.forEach((cssProp) => {
    // check for complex internals
    const hasTemplateLiteral =
      j(cssProp.parent).find(j.TaggedTemplateExpression).length > 0;
    if (hasTemplateLiteral) {
      replaceCssPropTemplateLiteral(cssProp.parent, j);
      return;
    }

    const hasLogicalExp =
      j(cssProp.parent).find(j.LogicalExpression).length > 0;
    if (hasLogicalExp) {
      replaceCssPropLogicalExpression(cssProp, j);
    }

    cssProp.node.name = "style";
  });
}

/**
 * Replaces
 * css={css`color: red`}
 * with
 * style={{ color: red }}
 */
function replaceCssPropTemplateLiteral(cssProp, j) {
  const template = j(cssProp).find(j.TemplateElement);

  const raw = template.get().value.value.raw;

  const styles = cssLiteralToStyleObject(raw);

  const templateExp = j(cssProp).find(j.TaggedTemplateExpression);

  j(templateExp.get()).replaceWith(`{ ${styles.join(", ")} }`);

  cssProp.node.name = "style";

  return;
}

function cssLiteralToStyleObject(rawStyles) {
  let styles = rawStyles
    .split("\n")
    .map((val) => val.trim())
    .filter(Boolean);

  // replace semicolons
  styles = styles.map((style) => style.replace(/;/gm, ""));

  // add quotation marks
  styles = styles.map((style) => style.replace(/: ([a-z0-9\s]+)/gm, `: "$1"`));

  // camelize
  styles = styles.map((style) =>
    style.replace(/-([a-z])/g, function(g) {
      return g[1].toUpperCase();
    })
  );

  return styles;
}

/**
 * Replaces
 * css={really && { color: 'red' }}
 * with
 * style={really ? { color: 'red' } : null}
 */
function replaceCssPropLogicalExpression(cssProp, j) {
  const exp = j(cssProp.parent)
    .find(j.LogicalExpression)
    .get();

  if (exp.node.operator !== "&&") {
    // only handling && operators
    return;
  }

  const right = exp.node.right;
  const left = exp.node.left;

  const conditional = j.conditionalExpression(left, right, j.literal(null));

  j(exp).replaceWith(conditional);

  return;
}

function replaceTernaryCssLiteral(prop, j) {
  const tempExp = j(prop.parent).find(j.TaggedTemplateExpression);

  if (tempExp.length === 0) return;

  const raw = tempExp.find(j.TemplateElement).get().value.value.raw;
  const styles = cssLiteralToStyleObject(raw);
  const objExp = styleArrayToObjectExpression(styles, j);

  tempExp.replaceWith(objExp);
}

function replaceClassname(root, j) {
  const classNameProps = root.find(j.JSXIdentifier, { name: "className" });
  if (classNameProps.length === 0) return;
  const errors = [];

  classNameProps.forEach((cnProp) => {
    const templateExp = j(cnProp.parent).find(j.Identifier, { name: "css" });

    const hasLogicalExp = j(cnProp.parent).find(j.LogicalExpression).length > 0;

    if (hasLogicalExp) {
      replaceCssPropLogicalExpression(cnProp, j);
      try {
        replaceTernaryCssLiteral(cnProp, j);
      } catch {
        const line = cnProp.parent.get().value.loc.start.line;

        errors.push({
          line,
          msg:
            "A CSS template literal with an interpolated expression was used inside a className prop. This cannot be polyfilled. Please fix manually - consider using a `style` prop instead.",
        });
      }
    }

    if (templateExp.length === 0) return;

    const rawStyles = [];

    j(templateExp.get().parent)
      .find(j.TemplateElement)
      .forEach((el) => {
        rawStyles.push(el.get().value.value.raw);
      });

    const expressions = j(templateExp.get().parent)
      .find(j.TemplateLiteral)
      .get().node.expressions;

    if (expressions.length > 0) {
      expressions.forEach((expression) => {
        errors.push({
          msg:
            "A CSS template literal with an interpolated expression was used inside a className prop. This cannot be polyfilled. Please fix manually - consider using a `style` prop instead.",
          line: expression.loc.start.line,
        });
      });
      return;
    }

    const styles = cssLiteralToStyleObject(rawStyles.join(""));

    let objExp;
    try {
      objExp = styleArrayToObjectExpression(styles, j);
    } catch (err) {
      const line = cnProp.parent.get().value.loc.start.line;

      errors.push({
        line,
        msg:
          "CSS selectors used inside the className prop. This cannot be polyfilled. We recommend moving these styles out and assigning them to a variable using the `css` fn from Linaria. Then you can assign that variable to the className prop",
      });
      return;
    }

    j(templateExp.get().parent).replaceWith(objExp);

    cnProp.node.name = "style";
  });

  return errors;
}

function styleArrayToObjectExpression(styles, j) {
  const hasNestedStyles = styles.some((style) => style.indexOf("{") > 0);

  if (hasNestedStyles) {
    throw new Error("nestedStyles");
  }

  const objExp = styles
    .map((style) => {
      const key = style.match(/(?<key>\w+):/).groups["key"];
      const val = style.match(/: "(?<val>.*)"/).groups["val"];
      return j.property("init", j.identifier(key), j.literal(val));
    })
    .filter(Boolean);

  return j.objectExpression(objExp);
}

function replaceUiThemeImport(root, j, path) {
  const fixedImport = fixImport(path);
  if (!fixedImport) return;

  replaceThemeFn();

  function replaceThemeFn() {
    const styledCalls = root.find(j.TaggedTemplateExpression, {
      tag: { callee: { name: "styled" } },
    });

    if (!styledCalls.length > 0) {
      return;
    }

    styledCalls.forEach((styled) => {
      const themeFns = j(styled).find(j.CallExpression, {
        callee: { name: "theme" },
      });

      if (!themeFns.length > 0) return;

      themeFns.forEach((themeFn) => {
        // args may have numbers i.e theme.colors.1 - convert to theme.colors[1]
        const args = themeFn.node.arguments[0].value;
        const bracketNotation = args.replace(/\.(.+?)(?=\.|$)/g, (_, s) => {
          const isString = isNaN(s);
          return isString ? `.${s}` : `[${s}]`;
        });

        j(themeFn).replaceWith(`theme.${bracketNotation}`);
      });
    });
  }

  function fixImport(path) {
    const utilThemeImport = root.find(j.ImportDeclaration, {
      source: { value: "@jetshop/ui/utils/theme" },
    });

    if (themeImportExists(root, j)) return false;
    if (utilThemeImport.length === 0) return false;

    utilThemeImport.get().value.source.value = getRelativeThemePath(path);
    utilThemeImport.find(j.Identifier).get().value.name = "{ theme }";

    return true;
  }
}

function themeImportExists(root, j) {
  const correctThemeImport = root
    .find(j.ImportDeclaration)
    .filter((nodePath) => {
      const specifier = nodePath.value.specifiers[0];

      if (!specifier) return false;

      if (
        specifier.local &&
        specifier.imported &&
        specifier.local.name === "theme" &&
        specifier.imported.name === "theme"
      )
        return true;
      if (specifier.local && specifier.local.name === "{ theme }") return true;

      return false;
    });

  return correctThemeImport.length > 0;
}

// get the theme path relative to the current file path
function getRelativeThemePath(path) {
  const targetPath = "/src/components/Theme";
  // Get the directory path to the file being processed, relative to /src/
  const currentPath = ("/src/" + path.split("src/")[1]).replace(
    /\/[^\/]+\.([^\/]+)+$/g,
    "/"
  );

  let relativePath = nodePath.posix.relative(currentPath, targetPath);

  if (relativePath === "Theme" || undefined) {
    relativePath = "./Theme";
  }

  return relativePath;
}

function replaceTheme(root, j, path) {
  const allImports = root.find(j.ImportDeclaration);
  const LAST_IMPORT = allImports.at(allImports.length - 1);

  let found = false;

  let errors = [];

  root.find(j.TaggedTemplateExpression).forEach((imp) => {
    const ids = j(imp.node)
      .find(j.Identifier)
      .filter((path) => path.node.name === "styled");

    // Replace ${({theme}) => theme.colors.red}
    ids.forEach((id) => {
      const fns = j(id.parent.parent)
        .find(j.ArrowFunctionExpression)
        .filter((path) => {
          const firstParam = path.node.params[0];

          const inlineCSSWarning = checkForInlineCSS(j, path);
          if (inlineCSSWarning) {
            errors.push(inlineCSSWarning);
            return false;
          }

          if (!firstParam.properties) {
            // If theme is anywhere in the function expression, process this node
            if (
              j(path)
                .find(j.MemberExpression)
                .find(j.Identifier, { name: "theme" }).length > 0
            )
              return true;

            return false;
          }

          if (firstParam.properties[0].value.name === "theme") return true;

          return false;
        });

      fns.forEach((fn) => {
        j(fn).replaceWith((path) => themify(path.node));
        found = true;
      });
    });
  });

  function themify(node) {
    // fixes the $(({theme}) => theme.color.red) case
    if (!node.params[0].name) return node.body;

    const paramName = node.params[0].name;
    //p

    const objects = removeParam(paramName, node.body.object, [
      node.body.property,
    ]);

    const length = objects.length;

    // fixes the ${p => p.theme.colors.red} case
    return objects.slice(0, -2).reduceRight((prev, curr) => {
      return j.memberExpression(prev, curr);
    }, j.memberExpression(objects[length - 1], objects[length - 2]));
  }

  function removeParam(paramName, obj, objects) {
    let collection = [...objects];

    if (obj.object) {
      if (obj.object.name === paramName) {
        return [...collection, obj.property];
      }
      collection.push(obj.property);
      return removeParam(paramName, obj.object, collection);
    }
  }

  if (found) {
    const themeImport = j.importDeclaration(
      [j.importSpecifier(j.identifier("theme"))],
      j.stringLiteral(getRelativeThemePath(path))
    );

    if (!themeImportExists(root, j)) {
      LAST_IMPORT.insertAfter(themeImport);
    }
  }

  return errors;
}

/**
 * uses inline css
 *
 * @example
 * ${({ root })} =>
 *   root && css`color: red`
 *
 * This is impossible to codemod
 */
function checkForInlineCSS(j, path) {
  const inlineCSS = j(path.node).find(j.Identifier, { name: "css" });
  const hasInlineCSS = inlineCSS.length > 0;

  if (hasInlineCSS) {
    return {
      line: path.node.loc.start.line,
      msg:
        "using `css` inside a styled template literal is no longer supported. Try using a regular className or consider inline styles",
    };
  }
}

function replaceStyledImport(root, j) {
  root.find(j.ImportDeclaration).forEach((imp) => {
    const { node } = imp;

    // Import may be react-emotion or just emotion
    if (
      node.source.value !== "react-emotion" &&
      node.source.value !== "emotion"
    ) {
      return;
    }

    // import emotion, { css } from 'react-emotion'
    if (
      node.specifiers.length > 1 &&
      node.specifiers[0].type === "ImportDefaultSpecifier"
    ) {
      const { node: defaultExport, named } = handleNamedAndDefaultExport(
        node,
        j
      );
      imp.insertAfter(named);
      return defaultExport;
    }

    // import styled from 'react-emotion'
    if (node.specifiers[0].local.name === "styled") {
      node.specifiers[0].local.name = "{ styled }";
      node.source.value = "linaria/react";
      return;
    }

    // import { css } from 'react-emotion'
    node.source.value = "linaria";
  });
}

function handleNamedAndDefaultExport(node, j) {
  const firstSpecifier = node.specifiers.shift();
  const namedImports = node.specifiers;

  const isEmotion =
    firstSpecifier.local.name === "styled" &&
    node.source.value === "react-emotion";

  const named = j.importDeclaration(namedImports, j.literal("linaria"));

  if (isEmotion) {
    firstSpecifier.local.name = "{ styled }";
    node.specifiers = [firstSpecifier];
    node.source.value = "linaria/react";
  }

  return { node, named };
}

function removeCssArrowFns(root, j) {
  const assignedArrowFns = root
    .find(j.VariableDeclaration)
    .find(j.ArrowFunctionExpression, { body: { tag: { name: "css" } } });

  assignedArrowFns.forEach((arrFn) => {
    const exp = j(arrFn)
      .find(j.TaggedTemplateExpression)
      .get();
    j(arrFn).replaceWith(exp.node);
  });
}
