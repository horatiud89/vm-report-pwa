import type { StoreDef, ZoneDef } from './types';

export const STORE_850: StoreDef = {
  id: '850',
  code: '850',
  name: 'Palladium Praha',
  country: 'CZ',
  timezone: 'Europe/Prague',
  departments: [
    {
      id: 'women',
      name: "WOMEN'S DEPARTMENT",
      zones: [
        { id: 'women-image', name: "Women's Image" },
        { id: 'women-wall-1', name: "Women's Wall 1" },
        { id: 'women-art-series-zone', name: "Women's Art. Series zone" },
        { id: 'women-denim-panel', name: "Women's Denim panel" },
        { id: 'women-denim-table-chest-of-drawers', name: "Women's Denim table (chest of drawers)" },
        { id: 'women-wall-2', name: "Women's Wall 2" },
        { id: 'women-table-1', name: "Women's Table 1" },
        { id: 'women-table-2', name: "Women's Table 2" },
        { id: 'women-wall-3', name: "Women's Wall 3" },
        { id: 'women-free-standing-zone-a', name: "Women's Free-standing zone A" },
        { id: 'women-free-standing-zone-b', name: "Women's Free-standing zone B" },
      ],
    },
    {
      id: 'men',
      name: "MEN'S DEPARTMENT",
      zones: [
        { id: 'men-wall-1', name: "Men's Wall 1" },
        { id: 'men-denim-panel', name: "Men's Denim panel" },
        { id: 'men-denim-table-chest-of-drawers', name: "Men's Denim table (chest of drawers)" },
        { id: 'men-wall-2', name: "Men's Wall 2" },
        { id: 'men-table-1', name: "Men's Table 1" },
        { id: 'men-image', name: "Men's Image" },
        { id: 'men-table-2', name: "Men's Table 2" },
        { id: 'men-wall-3', name: "Men's Wall 3" },
        { id: 'men-free-standing-zone-a', name: "Men's Free-standing zone A" },
        { id: 'men-free-standing-zone-b', name: "Men's Free-standing zone B" },
        { id: 'men-art-series-zone', name: "Men's Art. Series zone" },
      ],
    },
    {
      id: 'acc',
      name: 'ACC',
      zones: [
        { id: 'acc-mens-ladders-zone-a', name: "Men's Ladders zone A" },
        { id: 'acc-womens-ladders-zone-a', name: "Women's Ladders zone A" },
        { id: 'acc-mens-ladders-zone-b', name: "Men's Ladders zone B" },
        { id: 'acc-womens-ladders-zone-b', name: "Women's Ladders zone B" },
        { id: 'acc-cash-desk-ladders', name: 'Cash desk ladders' },
        { id: 'acc-acc-wall', name: 'ACC wall' },
      ],
    },
    {
      id: 'home',
      name: 'HOME',
      zones: [
        { id: 'home-home-wall', name: 'Home wall' },
        { id: 'home-small-table', name: 'Small table' },
        { id: 'home-large-table', name: 'Large table' },
      ],
    },
    {
      id: 'window',
      name: 'WINDOW',
      zones: [
        { id: 'window-window-1', name: 'Window 1' },
        { id: 'window-window-2', name: 'Window 2' },
      ],
    },
  ],
};

export function allZones(store: StoreDef): Array<ZoneDef & { departmentId: string; order: number }> {
  return store.departments
    .flatMap(d => d.zones.map(z => ({ ...z, departmentId: d.id })))
    .map((z, order) => ({ ...z, order }));
}
