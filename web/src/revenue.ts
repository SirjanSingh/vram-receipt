// Nvidia's most recent reported quarter, typed in by hand from Nvidia's own release.
// Update after each earnings release and add the change to data/SOURCES.md.
export const QUARTER = {
  label: "Q2 fiscal 2027",
  ended: "July 26, 2026",
  released: "Aug 26, 2026",
  totalB: 96.2,
  dataCenterB: 89.0,
  edgeB: 7.2,
  // GLOBE NEWSWIRE copy of "NVIDIA Announces Financial Results for Second Quarter Fiscal 2027".
  sourceUrl: "https://mfn.se/all/a/nvidia/nvidia-announces-financial-results-for-second-quarter-fiscal-2027-0d0c3f31",
  // Where Nvidia defines Edge Computing: PCs, game consoles, workstations, AI-RAN base stations, robotics, automotive.
  definitionUrl: "https://s201.q4cdn.com/141608511/files/doc_financials/2027/Q127/Q1FY27-CFO-Commentary.pdf",
} as const;
