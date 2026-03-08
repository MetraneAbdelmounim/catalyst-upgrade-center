import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Switch, Firmware, UpgradeJob, DashboardStats } from '../models/interfaces';
import { environment } from 'src/environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private api = environment.apiUrl;
  constructor(private http: HttpClient) {}

  // Switches
  getSwitches(f?: any): Observable<Switch[]> {
    let p = new HttpParams();
    if (f) Object.keys(f).forEach(k => { if (f[k]) p = p.set(k, f[k]); });
    return this.http.get<Switch[]>(`${this.api}/switches`, { params: p });
  }
  addSwitch(d: Partial<Switch>): Observable<Switch> { return this.http.post<Switch>(`${this.api}/switches`, d); }
  updateSwitch(id: string, d: Partial<Switch>): Observable<Switch> { return this.http.put<Switch>(`${this.api}/switches/${id}`, d); }
  deleteSwitch(id: string): Observable<any> { return this.http.delete(`${this.api}/switches/${id}`); }
  discoverSwitch(d: any): Observable<any> { return this.http.post(`${this.api}/switches/discover`, d); }
  checkAllSwitches(): Observable<any> { return this.http.post(`${this.api}/switches/check-all`, {}); }
  checkSwitch(id: string): Observable<any> { return this.http.post(`${this.api}/switches/${id}/check`, {}); }

  // Firmware
  getFirmware(f?: any): Observable<Firmware[]> {
    let p = new HttpParams();
    if (f) Object.keys(f).forEach(k => { if (f[k]) p = p.set(k, f[k]); });
    return this.http.get<Firmware[]>(`${this.api}/firmware`, { params: p });
  }
  addFirmware(d: Partial<Firmware>): Observable<Firmware> { return this.http.post<Firmware>(`${this.api}/firmware`, d); }
  deleteFirmware(id: string): Observable<any> { return this.http.delete(`${this.api}/firmware/${id}`); }

  // Upgrades
  startUpgrade(switchIds: string[], firmwareId: string): Observable<any[]> {
    return this.http.post<any[]>(`${this.api}/upgrades/start`, { switch_ids: switchIds, firmware_id: firmwareId });
  }
  getProgress(jobId: string): Observable<UpgradeJob> { return this.http.get<UpgradeJob>(`${this.api}/upgrades/progress/${jobId}`); }
  streamProgress(jobId: string): EventSource { return new EventSource(`${this.api}/upgrades/progress/${jobId}/stream`); }
  getActive(): Observable<UpgradeJob[]> { return this.http.get<UpgradeJob[]>(`${this.api}/upgrades/active`); }
  getHistory(f?: any): Observable<any[]> {
    let p = new HttpParams();
    if (f) Object.keys(f).forEach(k => { if (f[k] !== undefined) p = p.set(k, String(f[k])); });
    return this.http.get<any[]>(`${this.api}/upgrades/history`, { params: p });
  }

  // Dashboard
  getStats(): Observable<DashboardStats> { return this.http.get<DashboardStats>(`${this.api}/dashboard/stats`); }
}
