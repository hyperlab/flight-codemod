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
defineTest(__dirname, "emotion-to-linaria", null, "styled-arrow-fn-theme");
defineTest(__dirname, "emotion-to-linaria", null, "ui-utils-theme");
defineTest(__dirname, "emotion-to-linaria", null, "css-prop-to-style");
