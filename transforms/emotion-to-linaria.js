export default function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);

  replaceStyledImport(root, j);
  const { errors: replaceThemeErrors } = replaceTheme(root, j);

  const errors = [...replaceThemeErrors];
  if (errors.length > 0) {
    console.warn(`Manual edits needed in ${file.path}:`, errors);
  }

  return root.toSource({});
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
            // props.theme.below.xl syntax
            const hasTheme =
              j(path.node.body)
                .find(j.MemberExpression)
                .find(j.MemberExpression)
                .find(j.Identifier, { name: "theme" }).length > 0;

            if (hasTheme) {
              errors.push(
                "`${props => props.theme.x} could not be replaced. Please replace manually with ${theme.x}`"
              );
              return true;
            }

            return false;
          }

          return firstParam.properties[0].value.name === "theme";
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
