export default function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);

  replaceStyledImport(root, j);
  replaceTheme(root, j);

  return root.toSource({
    quote: "single",
    trailingComma: true
  });
}

function replaceTheme(root, j) {
  let found = false;
  root.find(j.TaggedTemplateExpression).forEach(imp => {
    const ids = j(imp.node)
      .find(j.Identifier)
      .filter(path => path.node.name === "styled");

    ids.forEach(id => {
      const fns = j(id.parent.parent).find(j.ArrowFunctionExpression);
      fns.forEach(fn => {
        j(fn).replaceWith(fn.node.body);
        found = true;
      });
    });
  });

  if (found) {
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
