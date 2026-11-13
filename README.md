# Campito

Gestión del campo para la familia: parcelas y fincas, diario de trabajo, gastos, ingresos, cosechas,
cuentas, inventario y correspondencia. Funciona en el móvil y en el ordenador, y se puede instalar
como una aplicación («Añadir a pantalla de inicio»).

Nace del Excel maestro *EJERCICIO 2026*. **No incluye nada de ganadería** (granja, cerdas, Bubesa):
el importador lo descarta.

## Cómo está hecha

| Pieza | Qué es |
|---|---|
| **Web** (`index.html`, `css/`, `js/`) | Páginas estáticas, sin compilar. Se publican con GitHub Pages. |
| **Base de datos y usuarios** | Supabase (Postgres). El esquema está en `supabase/*.sql`. |
| **Seguridad** | Hay que iniciar sesión **y** estar en la tabla `miembros`. Sin eso no se lee ni se escribe nada (RLS). |
| **Roles** | `admin` (todo), `editor` (añadir y modificar), `lector` (solo consultar). |

Las claves que hay en `js/config.js` son públicas por diseño; lo que protege los datos son las
políticas RLS. **Los datos de la familia no están en este repositorio** (`.gitignore` bloquea `.xlsx` y `.csv`).

## Primer uso

1. Publica la web: *Settings → Pages → Deploy from a branch → `main` / raíz*.
2. En Supabase: *Authentication → URL Configuration* → pon como *Site URL* la dirección de GitHub Pages
   (`https://USUARIO.github.io/Campito/`). Sin esto, los correos de confirmación apuntan a otro sitio.
3. Abre la web, **Crea tu cuenta**, confirma el correo y entra. Pulsa
   *«Soy la primera persona: quedarme como administrador»*.
4. Ve a **Importar Excel**, elige el archivo y pulsa *Importar ahora*.
5. En **Miembros con acceso** añade el correo de cada familiar con su rol; después ellos crean su cuenta con ese mismo correo.

## Estructura de los datos

```
entidades (Antonio, Pepe, Ada, Cati, Felipe, FBF, sociedades, Común)
cultivos ── fincas ── parcelas (SIGPAC)
               ├── diario_trabajo (horas → jornales → coste)
               └── cosechas
gastos ── proveedores · conceptos_gasto        ingresos ── compradores
cuentas ── movimientos_cuenta                  inventario · correspondencia
cabidas · titulos_cooperativa · derechos_pac · maquinaria · movimientos_ada   (cooperativa, PAC, compras, Ada)
```

* **Finca** = unidad de trabajo (p. ej. «Cincho»); agrupa varias **parcelas** SIGPAC. El diario y las cosechas se anotan por finca.
* **Explotación** = quién lleva la contabilidad (FBF, Cati, Felipe, Común). **Lote** = a quién pertenece la cosecha.
* **Pantallas de informes:** *Por persona* (ingresos, gastos y mano de obra de cada socio), *Producción por finca* (kg, kg/ha, jornales y coste) y *Jornales por semana*.
* **Reparto de gastos** (pantalla *Por persona*): los gastos de Hermanos Bueno SC, Agrobueno SC y FBF se reparten entre las explotaciones por hectáreas del cultivo al que van; «Hermanos» a partes iguales; los marcados como *personal* van enteros a su persona.
* Jornales = horas ÷ 6. Total de un gasto = importe × (1 + IVA) × cantidad. Ambos valores se pueden cambiar en *Ajustes* (tabla `ajustes`).

## Añadir un campo nuevo

1. Añade la columna en Supabase (`alter table … add column …`).
2. Añádela a la pantalla en `js/esquema.js` (una línea). Aparece sola en el formulario y en el listado.

## Desarrollo y pruebas

```bash
python3 -m http.server 8000          # y abrir http://localhost:8000
node tests/test-parser.mjs hojas.json  # comprobar el importador con un volcado del Excel (no se sube al repo)
```

## Pendiente (siguientes fases)

* Informes por persona: pagos reales de cada socio y contabilidad entre ellos (columnas «Pagos de…» del Excel).
* Informes por socio e impresión.
