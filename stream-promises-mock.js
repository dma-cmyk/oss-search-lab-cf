import { finished as nodeFinished } from 'node:stream';

export const finished = nodeFinished;
export default {
  finished,
};
