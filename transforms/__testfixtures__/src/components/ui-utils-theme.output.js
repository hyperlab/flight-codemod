/* eslint-disable */
import { theme } from "./Theme";

const LinePrice = styled(Price)`
  margin-top: 1rem;
  grid-area: bottomright;
  font-weight: 600;
  font-family: ${theme.fontFamilies.heavy};
  font-family: ${theme.colors[1]};
  text-align: right;
`;
