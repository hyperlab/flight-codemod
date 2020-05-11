/* eslint-disable */
import { styled } from "linaria/react";

import { theme } from "./Theme";

const Thing = styled("div")`
  background: pink;
  color: ${theme.color.red};

  ${theme.below.xl} {
    color: orange;
  }
`;
