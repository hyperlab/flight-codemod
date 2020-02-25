export default function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);

  replaceCssPropSimple(root, j);
  replaceUiThemeImport(root, j);
  const { errors: replaceThemeErrors } = replaceTheme(root, j);
  replaceStyledImport(root, j);

  const errors = [...replaceThemeErrors];
  if (errors.length > 0) {
    console.warn(`Manual edits needed in ${file.path}:`, errors);
  }

  return root.toSource({});
}

function replaceCssPropSimple(root, j) {
  const cssProps = root.find(j.JSXIdentifier, { name: "css" });
  if (!cssProps.length > 0) return;

  cssProps.forEach(cssProp => {
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

  let styles = template.get().value.value.raw;

  styles = styles
    .split("\n")
    .map(val => val.trim())
    .filter(Boolean);

  // replace semicolons
  styles = styles.map(style => style.replace(/;/gm, ""));

  // add quotation marks
  styles = styles.map(style => style.replace(/: ([a-z0-9\s]+)/gm, `: "$1"`));

  // camelize
  styles = styles.map(style =>
    style.replace(/-([a-z])/g, function(g) {
      return g[1].toUpperCase();
    })
  );

  styles = styles.join(", ");

  const templateExp = j(cssProp).find(j.TaggedTemplateExpression);

  j(templateExp.get()).replaceWith(`{ ${styles} }`);

  cssProp.node.name = "style";

  return;
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

function replaceUiThemeImport(root, j) {
  const fixedImport = fixImport();
  if (!fixedImport) return;

  replaceThemeFn();

  function replaceThemeFn() {
    const styledCalls = root.find(j.TaggedTemplateExpression, {
      tag: { callee: { name: "styled" } }
    });

    if (!styledCalls.length > 0) {
      return;
    }

    styledCalls.forEach(styled => {
      const themeFns = j(styled).find(j.CallExpression, {
        callee: { name: "theme" }
      });

      if (!themeFns.length > 0) return;

      themeFns.forEach(themeFn => {
        // args may have numbers i.e theme.colors.1 - convert to theme.colors[1]
        const args = themeFn.node.arguments[0].value;
        const bracketNotation = args.replace(/\.(.+?)(?=\.|$)/g, (m, s) => {
          const isString = isNaN(s);
          return isString ? `.${s}` : `[${s}]`;
        });

        j(themeFn).replaceWith(`theme.${bracketNotation}`);
      });
    });
  }

  function fixImport() {
    const utilThemeImport = root.find(j.ImportDeclaration, {
      source: { value: "@jetshop/ui/utils/theme" }
    });

    if (utilThemeImport.length === 0) return false;

    utilThemeImport.get().value.source.value = "Theme";
    utilThemeImport.find(j.Identifier).get().value.name = "{ theme }";

    return true;
  }
}

function replaceTheme(root, j) {
  const allImports = root.find(j.ImportDeclaration);
  const LAST_IMPORT = allImports.at(allImports.length - 1);

  let found = false;

  let errors = [];

  root.find(j.TaggedTemplateExpression).forEach(imp => {
    const ids = j(imp.node)
      .find(j.Identifier)
      .filter(path => path.node.name === "styled");

    ids.forEach(id => {
      const fns = j(id.parent.parent)
        .find(j.ArrowFunctionExpression)
        .filter(path => {
          // console.log(path.node);
          const firstParam = path.node.params[0];

          if (!firstParam.properties) {
            const propsDotThemeWarning = checkForPropsDotThemeUsage(j, path);
            if (propsDotThemeWarning) errors.push(propsDotThemeWarning);

            return false;
          }

          if (firstParam.properties[0].value.name === "theme") return true;

          const inlineCSSWarning = checkForInlineCSS(j, path);
          if (inlineCSSWarning) errors.push(inlineCSSWarning);

          return false;
        });

      fns.forEach(fn => {
        j(fn).replaceWith(fn.node.body);
        found = true;
      });
    });
  });

  if (found) {
    const themeImport = j.importDeclaration(
      [j.importSpecifier(j.identifier("theme"))],
      j.stringLiteral("Theme")
    );

    LAST_IMPORT.insertAfter(themeImport);
  }

  return { errors };
}

function checkForPropsDotThemeUsage(j, path) {
  // props.theme.below.xl syntax
  const hasTheme =
    j(path.node.body)
      .find(j.MemberExpression)
      .find(j.Identifier, { name: "theme" }).length > 0;

  if (hasTheme) {
    return "`${props => props.theme.x} could not be replaced. Please replace manually with ${theme.x}`";
  }
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
  const hasInlineCSS =
    j(path.node).find(j.Identifier, { name: "css" }).length > 0;

  if (hasInlineCSS) {
    return "using `css` inside a styled template literal is no longer supported. Try using a regular className or consider inline styles";
  }
}

function replaceStyledImport(root, j) {
  root.find(j.ImportDeclaration).forEach(imp => {
    const { node } = imp;

    if (node.source.value !== "react-emotion") {
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
