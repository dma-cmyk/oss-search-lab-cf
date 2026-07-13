export const spawn = () => { throw new Error("child_process.spawn is mocked"); };
export const exec = () => { throw new Error("child_process.exec is mocked"); };
export const execSync = () => { throw new Error("child_process.execSync is mocked"); };
export default {
  spawn,
  exec,
  execSync,
};
