import bcrypt from "bcrypt";
import config from "../config";


export const hashPassword = async (password: string): Promise<string> => {
  const hashedPassword = await bcrypt.hash(password, config.bcryptSaltRounds);
  return hashedPassword;
};


export const comparePassword = async (
  password: string,
  hashedPassword: string,
): Promise<boolean> => {
  const isMatch = await bcrypt.compare(password, hashedPassword);
  return isMatch;
};
