export default function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);

  replaceUiThemeImport(root, j);
  const { errors: replaceThemeErrors } = replaceTheme(root, j);
  replaceStyledImport(root, j);

  const errors = [...replaceThemeErrors];
  if (errors.length > 0) {
    console.warn(`Manual edits needed in ${file.path}:`, errors);
  }

  return root.toSource({});
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
