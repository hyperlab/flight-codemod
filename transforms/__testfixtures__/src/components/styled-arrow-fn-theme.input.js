/* eslint-disable */
import styled from "react-emotion";

const Thing = styled("div")`
  background: pink;
  color: ${({ theme }) => theme.color.red};

  ${({ theme }) => theme.below.xl} {
    color: orange;
  }
`;
