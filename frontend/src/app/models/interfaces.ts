export interface Switch {
  _id?: string; name: string; ip_address: string; model: string;
  platform: string; current_version: string; serial_number: string;
  site: string; ssh_username: string; ssh_password?: string;
  enable_password?: string; status: string; last_seen?: string;
  created_at?: string; notes?: string; selected?: boolean;
  // Stack support
  is_stack?: boolean;
  stack_count?: number;
  stack_master?: string;
  stack_members?: StackMember[];
}

export interface StackMember {
  switch_num: number; role: string; model: string;
  serial: string; version: string; state: string;
}

export interface Firmware {
  _id?: string; platform: string; model_family: string; version: string;
  filename: string; file_size: number; md5_hash: string;
  release_date?: string; is_recommended: boolean; release_notes?: string;
}

export interface UpgradeJob {
  job_id: string; switch_id: string; switch_name: string; switch_ip: string;
  firmware_version: string; firmware_filename?: string;
  status: string; overall_progress: number; current_step: string;
  steps: UpgradeStep[]; started_at?: string; finished_at?: string;
  batch_id?: string;
  is_stack?: boolean;
  stack_count?: number;
  stack_members_progress?: { [key: string]: { role: string; model: string; status: string; progress: number } };
}

export interface UpgradeStep {
  step: string; progress: number; detail: string; status: string; timestamp: string;
}

export interface DashboardStats {
  switches: { total: number; online: number; offline: number; upgrading: number; unknown: number };
  firmware: { total: number };
  upgrades: { total: number; successful: number; failed: number; running: number; success_rate: number };
  sites: { name: string; count: number }[];
  platforms: { name: string; count: number }[];
  versions: { version: string; count: number }[];
  recent_upgrades: any[];
}
