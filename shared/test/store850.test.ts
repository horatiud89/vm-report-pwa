import { expect, test } from 'vitest';
import { STORE_850, allZones } from '../src/store850';

test('store 850 identity', () => expect([STORE_850.id, STORE_850.code, STORE_850.name, STORE_850.country, STORE_850.timezone])
  .toEqual(['850', '850', 'Palladium Praha', 'CZ', 'Europe/Prague']));
test('departments in order', () => expect(STORE_850.departments.map(d => d.name))
  .toEqual(["WOMEN'S DEPARTMENT", "MEN'S DEPARTMENT", 'ACC', 'HOME', 'WINDOW']));
test('33 zones, exact names and order', () => expect(allZones(STORE_850).map(z => z.name)).toEqual([
  "Women's Image", "Women's Wall 1", "Women's Art. Series zone", "Women's Denim panel", "Women's Denim table (chest of drawers)",
  "Women's Wall 2", "Women's Table 1", "Women's Table 2", "Women's Wall 3", "Women's Free-standing zone A", "Women's Free-standing zone B",
  "Men's Wall 1", "Men's Denim panel", "Men's Denim table (chest of drawers)", "Men's Wall 2", "Men's Table 1", "Men's Image",
  "Men's Table 2", "Men's Wall 3", "Men's Free-standing zone A", "Men's Free-standing zone B", "Men's Art. Series zone",
  "Men's Ladders zone A", "Women's Ladders zone A", "Men's Ladders zone B", "Women's Ladders zone B", "Cash desk ladders", "ACC wall",
  'Home wall', 'Small table', 'Large table', 'Window 1', 'Window 2']));
test('zone ids unique, order 0..32', () => { const z = allZones(STORE_850);
  expect(new Set(z.map(x => x.id)).size).toBe(33); expect(z.map(x => x.order)).toEqual([...Array(33).keys()]); });
