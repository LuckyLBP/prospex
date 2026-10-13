import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "./db";
import { getAccount, getPrefs, savePrefs, setAvatarPath, updateName } from "./account";

const U = "dddddddd-0000-0000-0000-000000000031";
beforeAll(async () => {
  await pool.query(`delete from auth.users where id = $1`, [U]);
  await pool.query(`insert into auth.users (instance_id,id,aud,role,email,created_at,updated_at) values ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated','acct@example.invalid',now(),now())`, [U]);
  await pool.query(`insert into profiles (user_id, email) values ($1, 'acct@example.invalid')`, [U]);
});
afterAll(async () => { await pool.query(`delete from auth.users where id = $1`, [U]); await pool.end(); });

describe("account", () => {
  it("changes the name and the avatar path, and reports the old path so it can be removed", async () => {
    expect(await getAccount(U)).toMatchObject({ fullName: null, email: "acct@example.invalid", avatarPath: null });
    await updateName(U, "Anna Test");
    expect(await setAvatarPath(U, "a1.webp")).toBeNull();
    expect(await setAvatarPath(U, "a2.webp")).toBe("a1.webp");
    expect(await getAccount(U)).toMatchObject({ fullName: "Anna Test", avatarPath: "a2.webp" });
    expect(await setAvatarPath(U, null)).toBe("a2.webp");
  });
  it("has defaults for someone who never saved settings, then saves and updates them", async () => {
    expect(await getPrefs(U)).toEqual({ order: "slump", template: null, callbackEmail: false });
    await savePrefs(U, { order: "namn", template: "fresh", callbackEmail: true });
    expect(await getPrefs(U)).toEqual({ order: "namn", template: "fresh", callbackEmail: true });
    await savePrefs(U, { order: "nyast", template: null, callbackEmail: false });
    expect(await getPrefs(U)).toEqual({ order: "nyast", template: null, callbackEmail: false });
  });
});
