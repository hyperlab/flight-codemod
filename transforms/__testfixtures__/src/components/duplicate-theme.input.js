/* eslint-disable */
import styled from "react-emotion";

import theme from "@jetshop/ui/utils/theme";

const Thing = styled("div")`
  background: pink;
  color: ${({ theme }) => theme.color.red};

  ${theme.below.xl} {
    color: orange;
  }
`;
