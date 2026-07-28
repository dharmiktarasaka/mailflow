import mongoose from 'mongoose';
import { Account } from '../db/models.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const accounts = await Account.find();
  console.log(JSON.stringify(accounts, null, 2));
  await mongoose.disconnect();
}
check();
