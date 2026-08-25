/**
 * Registro estático de usuarios para la autenticación de la demo.
 * Roles: mapeados a los 4 roles RBAC frozen en REQUIREMENTS.md §4. Nombres
 * localizados a personal chileno (Aguas del Valle).
 *
 * UNA CLAVE POR PERSONA. Antes tres personas compartían `tec123` y dos
 * compartían `plan123`: con credenciales compartidas la traza de quién registró
 * o validó una parada no vale nada, porque cualquiera de los tres pudo ser. Cada
 * persona tiene ahora su propia clave, y el usuario `admin/admin` — la más débil
 * del conjunto — dejó de existir.
 *
 * Los `id` NO cambian: viajan en la cookie `mes-session` y son los que
 * referencian `createdBy` / `validatedBy` en los datos ya sembrados.
 *
 * Las claves siguen en texto plano porque esto es una demo sin hashing; no
 * viajan al cliente (`/api/auth/directory` devuelve el roster sin ellas).
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
    username: "maria.sosa",
    password: "Sosa.Sup26",
    displayName: "María Sosa",
    role: "Supervisor",
    department: "Confiabilidad",
    shift: "Día",
  },
  {
    id: "usr_planner_01",
    username: "rodrigo.fuentes",
    password: "Fuentes.Pln26",
    displayName: "Rodrigo Fuentes",
    role: "Planificador",
    department: "Planificación de Mantenimiento",
    shift: "Día",
  },
  {
    id: "usr_planner_02",
    username: "patricia.rojas",
    password: "Rojas.Pln26",
    displayName: "Patricia Rojas",
    role: "Planificador",
    department: "Planificación de Mantenimiento",
    shift: "Día",
  },
  {
    id: "usr_tech_01",
    username: "carlos.ferreyra",
    password: "Ferreyra.Mec26",
    displayName: "Carlos Ferreyra",
    role: "Mantenedor",
    department: "Mantenimiento Mecánico",
    shift: "Día",
  },
  {
    id: "usr_tech_02",
    username: "ana.duarte",
    password: "Duarte.Ele26",
    displayName: "Ana Duarte",
    role: "Mantenedor",
    department: "Mantenimiento Eléctrico",
    shift: "Noche",
  },
  {
    id: "usr_inspector_01",
    username: "luis.cortes",
    password: "Cortes.Insp26",
    displayName: "Luis Cortés",
    role: "Mantenedor",
    department: "Inspección",
    shift: "Día",
  },
  {
    id: "usr_viewer_01",
    username: "jorge.mendez",
    password: "Mendez.Lec26",
    displayName: "Jorge Méndez",
    role: "Lector",
    department: "Operaciones",
    shift: "Día",
  },
];

// Guarda de desarrollo: si alguien vuelve a copiar y pegar un usuario sin
// cambiarle la clave, se entera acá y no en una auditoría.
if (process.env.NODE_ENV !== "production") {
  const claves = users.map((u) => u.password);
  const repetidas = [...new Set(claves.filter((c, i) => claves.indexOf(c) !== i))];
  if (repetidas.length) {
    console.warn(`[users] Hay claves compartidas entre personas (${repetidas.length}). Cada persona debe tener la suya.`);
  }
}

export function findUser(username: string, password: string): AppUser | null {
  return users.find((u) => u.username === username && u.password === password) ?? null;
}

export function getUserById(id: string): AppUser | null {
  return users.find((u) => u.id === id) ?? null;
}
