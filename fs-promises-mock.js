export const readFile = async () => { throw new Error("fs.promises.readFile is mocked"); };
export const writeFile = async () => { throw new Error("fs.promises.writeFile is mocked"); };
export default {
  readFile,
  writeFile,
};
