import { ProductPriceItem } from '../types/swarm';

export interface DesktopFile {
  id: string;
  name: string;
  path: string;
  size: string;
  modified: string;
  type: 'file' | 'folder';
  content?: string;
}

export const INITIAL_FILES: DesktopFile[] = [
  {
    id: 'f-1',
    name: 'RTX5090_Comparison.xlsx',
    path: 'C:\\Users\\Workspace\\Documents\\RTX5090_Comparison.xlsx',
    size: '42.8 KB',
    modified: 'منذ لحظات (مولد آلياً)',
    type: 'file',
    content: 'Excel Spreadsheet containing RTX 5090 pricing, scalper discrepancies, and retailer catalog.',
  },
  {
    id: 'f-2',
    name: 'system_security_audit.log',
    path: 'C:\\Users\\Workspace\\Documents\\system_security_audit.log',
    size: '18.4 KB',
    modified: 'اليوم 09:30 AM',
    type: 'file',
    content: '[AUDIT OK] Integrity verified across system registries and active services.',
  },
  {
    id: 'f-3',
    name: 'Downloads',
    path: 'C:\\Users\\Workspace\\Downloads',
    size: '4.2 GB',
    modified: 'أمس 04:15 PM',
    type: 'folder',
  },
  {
    id: 'f-4',
    name: 'Projects',
    path: 'C:\\Users\\Workspace\\Projects',
    size: '1.2 GB',
    modified: '24 سبتمبر 2026',
    type: 'folder',
  },
  {
    id: 'f-5',
    name: 'config_swarm.yaml',
    path: 'C:\\AetherSwarm\\config.yaml',
    size: '3.1 KB',
    modified: 'اليوم 08:00 AM',
    type: 'file',
    content: 'orchestrator:\n  autonomy: ASSISTED\n  max_parallel_agents: 6\n  evidence_threshold: 0.90',
  },
];

export const INITIAL_PRODUCTS: ProductPriceItem[] = [
  {
    id: 'p-1',
    brand: 'NVIDIA GeForce RTX 5090 Founders Edition',
    retailer: 'NVIDIA Official Store',
    price: '$1,999.00',
    vram: '32GB GDDR7',
    availability: 'Preorder / Verified MSRP',
    confidence: 0.99,
    verifiedSource: 'NVIDIA Global Hardware Portal',
  },
  {
    id: 'p-2',
    brand: 'ASUS ROG Strix GeForce RTX 5090 OC Edition',
    retailer: 'Newegg US',
    price: '$2,399.99',
    vram: '32GB GDDR7',
    availability: 'In Stock (Ship in 24h)',
    confidence: 0.95,
    verifiedSource: 'Newegg Direct Merchant API',
  },
  {
    id: 'p-3',
    brand: 'MSI GeForce RTX 5090 Suprim Liquid X',
    retailer: 'B&H Photo Video',
    price: '$2,249.99',
    vram: '32GB GDDR7',
    availability: 'Pre-order Available',
    confidence: 0.93,
    verifiedSource: 'B&H Authorized Dealer Feed',
  },
  {
    id: 'p-4',
    brand: 'Gigabyte AORUS GeForce RTX 5090 Master',
    retailer: 'Amazon US',
    price: '$2,199.00',
    vram: '32GB GDDR7',
    availability: 'Reserved Stock',
    confidence: 0.91,
    verifiedSource: 'Amazon Retail Verified Seller',
  },
  {
    id: 'p-5',
    brand: 'ZOTAC Gaming GeForce RTX 5090 Solid OC',
    retailer: 'Best Buy US',
    price: '$2,099.99',
    vram: '32GB GDDR7',
    availability: 'Coming Soon',
    confidence: 0.89,
    verifiedSource: 'Best Buy Retail Feed',
  },
];
