// v0.20 ten town layouts ("ผังเมือง 10 แบบ"). Every founder's town gets a different one, so no two towns look alike.
// The village core around CENTER (40, 50) is the same in every layout (house plots, public plots); everything around it
// moves: the river's course, the lake or the sea, the hill with the government district, the market quarter, the new
// town, fields, mine, snow mountain, deep forest, the temple. Pure data (tiles, world is 144 x 96).
//   zones: x, y = centre; districts keep their own internal layout (cityPlan.js) relative to this centre.
//   river: polyline (3 tiles wide) or null. lake: {x, y, rx, ry, island} or null. sea: 'east' | 'south' | null.
// Paths are generated: from the village gate, straight to the zone's front row, then across (bridges are added
// automatically where a path crosses the river). Future zones (tier 9) are kept as open land: port, oil field, ...
export const LAYOUTS = [
  { id: 'classic', th: 'ลุ่มน้ำตก (ต้นแบบ)',
    river: [[60, 0], [61, 8], [65, 16], [67, 24], [67, 34], [67, 44], [68, 54], [67, 64], [62, 72], [56, 77]], lake: { x: 50, y: 84, rx: 19, ry: 8, island: true },
    zones: { hill: [93, 23], quarter: [87, 53], newtown: [121, 46], fields: [15, 75], mine: [7, 36], snow: [134, 12], deep: [124, 80], temple: [30, 75] } },
  { id: 'twin', th: 'สองฝั่งแม่น้ำ',
    river: [[104, 0], [102, 12], [106, 24], [103, 36], [105, 48], [101, 60], [104, 72], [102, 84], [104, 95]], lake: null,
    zones: { hill: [84, 20], quarter: [84, 58], newtown: [125, 46], fields: [16, 82], mine: [126, 82], snow: [128, 10], deep: [36, 10], temple: [64, 82] } },
  { id: 'lakeside', th: 'เมืองริมทะเลสาบ',
    river: [[132, 0], [128, 14], [124, 26], [118, 34]], lake: { x: 104, y: 44, rx: 15, ry: 11, island: true },
    zones: { hill: [86, 78], quarter: [84, 20], newtown: [124, 76], fields: [14, 80], mine: [8, 30], snow: [136, 12], deep: [40, 10], temple: [62, 80] } },
  { id: 'coast', th: 'เมืองชายทะเล', sea: 'east',
    river: [[78, 0], [80, 14], [76, 28], [79, 42], [76, 56], [80, 70], [77, 84], [79, 95]], lake: null,
    zones: { hill: [100, 22], quarter: [98, 68], newtown: [56, 84], fields: [15, 78], mine: [8, 34], snow: [42, 9], deep: [100, 88], temple: [26, 86], port: [117, 42] } },
  { id: 'valley', th: 'หุบเขาสองฝั่ง',
    river: [[70, 0], [72, 10], [70, 22], [73, 34], [70, 46], [72, 58], [70, 70], [73, 82], [70, 95]], lake: null,
    zones: { hill: [104, 50], quarter: [96, 20], newtown: [126, 20], fields: [100, 82], mine: [10, 30], snow: [134, 66], deep: [24, 86], temple: [56, 84] } },
  { id: 'delta', th: 'ปากแม่น้ำ', sea: 'south',
    river: [[96, 0], [92, 12], [96, 26], [92, 40], [96, 54], [92, 66], [94, 78]], lake: null,
    zones: { hill: [74, 18], quarter: [120, 30], newtown: [122, 62], fields: [16, 70], mine: [8, 30], snow: [126, 6], deep: [40, 9], temple: [74, 64], port: [58, 74] } },
  { id: 'highland', th: 'ที่สูงเหมืองแร่',
    river: [[86, 0], [88, 12], [84, 24], [86, 36], [82, 48], [84, 60], [80, 72], [70, 80], [58, 84]], lake: { x: 46, y: 86, rx: 13, ry: 6 },
    zones: { hill: [114, 22], quarter: [116, 54], newtown: [118, 82], fields: [16, 78], mine: [70, 14], snow: [8, 14], deep: [26, 90], temple: [72, 58] } },
  { id: 'island', th: 'เกาะกลางน้ำ',
    river: [[66, 0], [68, 14], [66, 28], [68, 42], [66, 56], [68, 70], [66, 84], [68, 95]], lake: { x: 118, y: 84, rx: 18, ry: 8, island: true },
    zones: { hill: [92, 52], quarter: [94, 18], newtown: [126, 40], fields: [14, 82], mine: [8, 28], snow: [128, 8], deep: [40, 90], temple: [86, 80] } },
  { id: 'plains', th: 'ที่ราบนาข้าว',
    river: [[120, 0], [118, 14], [122, 28], [118, 42], [122, 56], [118, 70], [121, 84], [119, 95]], lake: { x: 20, y: 86, rx: 14, ry: 6 },
    zones: { hill: [84, 46], quarter: [86, 77], newtown: [106, 22], fields: [12, 30], mine: [134, 30], snow: [134, 8], deep: [134, 80], temple: [54, 82] } },
  { id: 'oldtown', th: 'เมืองเก่าริมคลอง',
    river: [[0, 22], [10, 26], [16, 24]], lake: { x: 84, y: 80, rx: 17, ry: 9, island: true },
    zones: { hill: [100, 22], quarter: [82, 50], newtown: [122, 54], fields: [16, 82], mine: [8, 40], snow: [134, 10], deep: [128, 86], temple: [56, 82] } },
];
// district internal layout: row the path arrives on (relative to the zone centre) and the area cleared around it
export const ZONE_SHAPES = {
  village: { rx: 24, ry: 21, tier: 1, th: 'หมู่บ้านเริ่มต้น' },
  fields: { rx: 13, ry: 9, tier: 1, th: 'พื้นที่เพาะปลูก', row: 0 },
  hill: { rx: 17, ry: 15, cy: 2, tier: 3, th: 'ศาลากลาง', row: 7 },
  temple: { rx: 8, ry: 6, tier: 3, th: 'วัด', row: 4 },
  mine: { rx: 9, ry: 10, tier: 3, th: 'เหมืองหิน', row: 0 },
  quarter: { rx: 16, ry: 14, tier: 4, th: 'ย่านตลาด', row: 0 },
  newtown: { rx: 16, ry: 15, tier: 5, th: 'เขตเมืองใหม่', row: 0 },
  snow: { rx: 14, ry: 14, tier: 9, th: 'ภูเขาหิมะ' },
  deep: { rx: 20, ry: 14, tier: 9, th: 'ป่าลึก' },
  port: { rx: 12, ry: 10, tier: 5, th: 'ท่าเรือและบ่อน้ำมัน', row: 3 },
  lake: { tier: 1, th: 'ทะเลสาบ' },
};
