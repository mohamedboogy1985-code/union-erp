import type {
  AttendanceDevice,
  AttendanceMonthlySummary,
  AttendanceSettings,
} from './erp.js';

/** أنواع شاشة بصمة اليد والوجه وربطها بالمراتب. */

export type BiometricMethodKey = 'FINGERPRINT' | 'FACE';

export interface BiometricEnrollment {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  methods: BiometricMethodKey[];
  fingerQuality: number;
  faceQuality: number;
  faceThumbnail?: string;
  enrolledAt: string;
  enrolledBy: string;
  enrolledByName: string;
}

export type PayrollLinkStatus =
  'NOT_LINKED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface PayrollLinkState {
  status: PayrollLinkStatus;
  requestedBy?: string;
  requestedByName?: string;
  requestedAt?: string;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string;
  noteAr?: string;
  appliedMonth?: string;
}

export interface BiometricPunchLog {
  id: string;
  employeeId: string;
  employeeName: string;
  method: BiometricMethodKey;
  direction: 'IN' | 'OUT';
  timestamp: string;
  score: number;
  deviceId?: string;
  simulated: boolean;
  messageAr: string;
}

export interface BiometricEmployeeRow {
  id: string;
  code: string;
  fullName: string;
  jobTitle: string;
  enrolled: boolean;
}

export interface BiometricOverview {
  year: number;
  month: number;
  devices: AttendanceDevice[];
  settings: AttendanceSettings;
  employees: BiometricEmployeeRow[];
  enrollments: BiometricEnrollment[];
  punches: BiometricPunchLog[];
  summaries: AttendanceMonthlySummary[];
  payrollLink: PayrollLinkState;
  canRequestLink: boolean;
  canDecideLink: boolean;
  approverNameAr: string;
  effectsAr: string[];
}
