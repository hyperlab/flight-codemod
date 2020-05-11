jest.autoMockOff();

const defineTest = require("jscodeshift/dist/testUtils").defineTest;

defineTest(__dirname, "emotion-to-linaria", null, "styled-emotion-to-linaria");
defineTest(__dirname, "emotion-to-linaria", null, "css-emotion-to-linaria");
defineTest(__dirname, "emotion-to-linaria", null, "css-cx-emotion-to-linaria");
defineTest(
  __dirname,
  "emotion-to-linaria",
  null,
  "styled-css-cx-emotion-to-linaria"
);
defineTest(
  __dirname,
  "emotion-to-linaria",
  null,
  "src/components/styled-arrow-fn-theme"
);
defineTest(
  __dirname,
  "emotion-to-linaria",
  null,
  "src/components/ui-utils-theme"
);
defineTest(
  __dirname,
  "emotion-to-linaria",
  null,
  "src/components/duplicate-theme"
);
defineTest(__dirname, "emotion-to-linaria", null, "css-prop-to-style");
defineTest(
  __dirname,
  "emotion-to-linaria",
  null,
  "css-prop-template-literal-to-style"
);
defineTest(
  __dirname,
  "emotion-to-linaria",
  null,
  "css-prop-logical-expression-to-style"
);
defineTest(__dirname, "emotion-to-linaria", null, "classname-css-literal");
defineTest(
  __dirname,
  "emotion-to-linaria",
  null,
  "classname-logical-expression-to-style"
);
defineTest(
  __dirname,
  "emotion-to-linaria",
  null,
  "css-emotion-core-to-linaria"
);
