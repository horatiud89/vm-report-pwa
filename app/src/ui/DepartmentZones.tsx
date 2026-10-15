import { Link } from 'react-router-dom';
import type { ReportDoc, StoreDef, ZoneDoc } from '@shared/types';
import { badgeState } from '../store/zoneBadge';
import { StatusBadge } from './StatusBadge';

/**
 * The zones of a report under their department, each row a link to the zone with its status. The store
 * definition gives the department names; until it is there a department is shown by its id.
 */
export function DepartmentZones({ report, zones, store }: { report: ReportDoc; zones: ZoneDoc[]; store: StoreDef | null }) {
  const departments: Array<{ id: string; name: string; zones: ZoneDoc[] }> = [];
  for (const zone of zones) {
    let department = departments.find((d) => d.id === zone.departmentId);
    if (!department) {
      department = {
        id: zone.departmentId,
        name: store?.departments.find((d) => d.id === zone.departmentId)?.name ?? zone.departmentId.toUpperCase(),
        zones: [],
      };
      departments.push(department);
    }
    department.zones.push(zone);
  }

  const now = Date.now();
  return departments.map((department) => (
    <section key={department.id}>
      <h2 className="dept-heading">{department.name}</h2>
      <ul className="rows">
        {department.zones.map((zone) => (
          <li key={zone.id}>
            <Link to={`/r/${report.id}/z/${zone.id}`} className="row-link">
              <span className="row-title">{zone.name}</span>
              <StatusBadge state={badgeState(zone, report, now)} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  ));
}
