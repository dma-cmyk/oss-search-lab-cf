export const readFileSync = () => { throw new Error("fs.readFileSync is mocked"); };
export const writeFileSync = () => { throw new Error("fs.writeFileSync is mocked"); };
export const existsSync = () => false;
export const statSync = () => { throw new Error("fs.statSync is mocked"); };
export const stat = () => { throw new Error("fs.stat is mocked"); };
export const readdirSync = () => [];
export const mkdirSync = () => {};
export const createReadStream = () => { throw new Error("fs.createReadStream is mocked"); };
export const createWriteStream = () => { throw new Error("fs.createWriteStream is mocked"); };
export const promises = {
  readFile: async () => { throw new Error("fs.promises.readFile is mocked"); },
  writeFile: async () => { throw new Error("fs.promises.writeFile is mocked"); },
};

export default {
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  stat,
  readdirSync,
  mkdirSync,
  createReadStream,
  createWriteStream,
  promises,
};
