export type CampaignCategory = 
  | 'Bounty'
  | 'NFT'
  | 'AttentionFi';

export interface Campaign {
  id: string;
  title: string;
  url: string;
  tag: CampaignCategory;
  endTime: string; // ISO string
  createdAt: string;
  rewardPool?: string;
  description?: string;
  createdBy?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
}

export type UserRole = 'super_admin' | 'admin' | 'user';

export interface UserAccount {
  id: string;
  email: string;
  password?: string;
  role: UserRole;
  createdAt: string;
  verified: boolean;
  completedCampaignIds: string[];
  lastLoginAt?: string;
  loginCount?: number;
}

export interface PasswordResetSession {
  email: string;
  code: string;
  expiresAt: number;
}

export interface LoginAuditLog {
  id: string;
  email: string;
  action: 'LOGIN' | 'SIGNUP';
  timestamp: number;
  dateStr: string;
  timeStr: string;
}

export interface VerificationSession {
  email: string;
  code: string;
  expiresAt: number;
  tempPasswordHash?: string;
}

export type FilterStatus = 'all' | 'active' | 'urgent' | 'ended';

export type CategoryFilter = 'all' | CampaignCategory;
