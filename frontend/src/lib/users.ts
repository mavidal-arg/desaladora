/**
 * Static user registry for demo-grade authentication (EAM Entity-360).
 * Roles [basado en datos / inferencia]: mapeados a los 4 roles RBAC frozen en
 * REQUIREMENTS.md §4. Nombres localizados a personal chileno (Aguas del Valle).
 */

export interface AppUser {
  id: string;
  username: string;
  password: string;
  displayName: string;
  role: string;
  department: string;
  shift: string;
  [key: string]: unknown;
}

export const users: AppUser[] = [
  {
    id: "usr_supervisor_01",
    username: "admin",
    password: "admin",
    displayName: "María Sosa",
    role: "Supervisor",
    department: "Confiabilidad",
    shift: "Día",
  },
  {
    id: "usr_planner_01",
    username: "planner",
    password: "plan123",
    displayName: "Rodrigo Fuentes",
    role: "Planificador",
    department: "Planificación de Mantenimiento",
    shift: "Día",
  },
  {
    id: "usr_planner_02",
    username: "patricia.rojas",
    password: "plan123",
    displayName: "Patricia Rojas",
    role: "Planificador",
    department: "Planificación de Mantenimiento",
    shift: "Día",
  },
  {
    id: "usr_tech_01",
    username: "mantenedor",
    password: "tec123",
    displayName: "Carlos Ferreyra",
    role: "Mantenedor",
    department: "Mantenimiento Mecánico",
    shift: "Día",
  },
  {
    id: "usr_tech_02",
    username: "ana.duarte",
    password: "tec123",
    displayName: "Ana Duarte",
    role: "Mantenedor",
    department: "Mantenimiento Eléctrico",
    shift: "Noche",
  },
  {
    id: "usr_inspector_01",
    username: "inspector",
    password: "tec123",
    displayName: "Luis Cortés",
    role: "Mantenedor",
    department: "Inspección",
    shift: "Día",
  },
  {
    id: "usr_viewer_01",
    username: "lector",
    password: "view123",
    displayName: "Jorge Méndez",
    role: "Lector",
    department: "Operaciones",
    shift: "Día",
  },
];

export function findUser(username: string, password: string): AppUser | null {
  return users.find((u) => u.username === username && u.password === password) ?? null;
}

export function getUserById(id: string): AppUser | null {
  return users.find((u) => u.id === id) ?? null;
}
