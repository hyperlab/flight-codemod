export default function transformer(file, api) {
  const j = api.jscodeshift;

  return j(file.source)
    .find(j.ImportDeclaration)
    .filter(i => i.value.source.value === "react-apollo-hooks")
    .forEach(path => {
      path.value.source.value = "@apollo/react-hooks";
    })
    .toSource();
}
