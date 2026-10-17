// node scripts/debugDay.mjs <seed> <YYYY-MM> <day> <early|late|night>  (typical mix, same data as simulateRandomEmployees.mjs)
// Lists who works the given shift type on that day and why (generator explanations).
import { spawnSync } from 'node:child_process';
const [seed, month, day, type] = process.argv.slice(2);
const [year, mon] = month.split('-').map(Number);
process.env.DEBUG_DAY = JSON.stringify({ seed, year, mon, day: Number(day), type });
const result = spawnSync(process.execPath, ['scripts/simulateRandomEmployees.mjs', '--seed', seed, '--months', String(((mon - 1) % 12) + 1), '--start', `${year}-01`, '--mix', 'typical', '--quiet'], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 0);
