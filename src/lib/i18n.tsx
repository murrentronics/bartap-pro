/**
 * i18n — lightweight English / Spanish translation system.
 *
 * Usage:
 *   const { t, lang, setLang } = useTranslation();
 *   <button>{t("logout")}</button>
 *
 * Keys that are missing from a language fall back to English automatically.
 * User-created content (product names, machine names, etc.) is NEVER passed
 * through t() — only hardcoded UI strings are.
 */
import {
  createContext, useContext, useState, useCallback,
  useEffect, type ReactNode,
} from "react";

export type Lang = "en" | "es";

const LS_KEY = "app_language";

// ── Translation map ──────────────────────────────────────────────────────────
// Keys are short English identifiers. Values are the Spanish translations.
// English is the fallback so only Spanish entries are needed here.
const ES: Record<string, string> = {
  // ── Navigation / Menu ─────────────────────────────────────────────────────
  "menu":             "Menú",
  "logout":           "Cerrar sesión",
  "language":         "Idioma",
  "billing":          "Facturación",
  "profile":          "Perfil",
  "factory_reset":    "Restaurar fábrica",
  "bar":              "Bar",
  "wallet":           "Billetera",
  "cashiers":         "Cajeros",
  "products":         "Productos",
  "machines":         "Máquinas",
  "credit":           "Crédito",
  "music":            "Música",

  // ── Common buttons ────────────────────────────────────────────────────────
  "save":             "Guardar",
  "cancel":           "Cancelar",
  "confirm":          "Confirmar",
  "delete":           "Eliminar",
  "edit":             "Editar",
  "close":            "Cerrar",
  "back":             "Atrás",
  "next":             "Siguiente",
  "done":             "Listo",
  "create":           "Crear",
  "add":              "Agregar",
  "remove":           "Eliminar",
  "search":           "Buscar",
  "clear":            "Limpiar",
  "yes":              "Sí",
  "no":               "No",
  "ok":               "OK",
  "submit":           "Enviar",
  "update":           "Actualizar",
  "select":           "Seleccionar",
  "approve":          "Aprobar",
  "reject":           "Rechazar",
  "copy":             "Copiar",
  "download":         "Descargar",
  "share":            "Compartir",
  "send":             "Enviar",
  "sign_out":         "Cerrar sesión",
  "go_to_billing":    "Ir a facturación",
  "view_plans":       "Ver planes",
  "renew":            "Renovar",

  // ── Status labels ─────────────────────────────────────────────────────────
  "active":           "ACTIVO",
  "pending":          "PENDIENTE",
  "overdue":          "VENCIDO",
  "suspended":        "SUSPENDIDO",
  "expelled":         "EXPULSADO",
  "paid":             "PAGADO",
  "rejected":         "RECHAZADO",
  "approved":         "APROBADO",
  "open":             "ABIERTO",
  "closed":           "CERRADO",
  "loading":          "Cargando…",

  // ── Login page ────────────────────────────────────────────────────────────
  "sign_in":          "Iniciar sesión",
  "username":         "Usuario",
  "password":         "Contraseña",
  "forgot_password":  "¿Olvidaste tu contraseña?",
  "reset_password":   "Restablecer contraseña",
  "enter_username":   "Ingresa tu usuario",
  "enter_password":   "Ingresa tu contraseña",
  "signing_in":       "Iniciando sesión…",

  // ── Bar / Register ────────────────────────────────────────────────────────
  "cash_sale":        "Venta en efectivo",
  "credit_sale":      "Venta a crédito",
  "cart":             "Carrito",
  "total":            "Total",
  "paid_amount":      "Pagado",
  "change":           "Cambio",
  "qty":              "Cant.",
  "category":         "Categoría",
  "all":              "Todos",
  "sort_item_order":  "⇅ Ordenar ítems",
  "done_sorting":     "✓ Listo",
  "sort_tap_select":  "Toca un ítem para seleccionar, luego toca otro para intercambiar",
  "sort_tap_swap":    "Ahora toca otro ítem para intercambiar su posición",
  "shot_from_bottle": "🥃 Trago de botella abierta",
  "retail_cigg_paper":"🚬 Cigarrillo y papel al detal",
  "select_liquor":    "🥃 Seleccionar licor",
  "add_shot":         "🥃 Agregar trago",
  "select_cigg_paper":"🚬 Seleccionar cigarrillo o papel",
  "add_to_order":     "🚬 Agregar al pedido",
  "change_btn":       "Cambiar",
  "no_products":      "No hay productos. Agrega uno en Productos.",
  "confirm_sale":     "Confirmar venta",
  "proceed":          "Proceder",
  "new_account":      "+ Nueva cuenta",
  "yes_charge":       "Sí, cobrar",
  "confirm_customer": "¿Confirmar cliente?",
  "charge_to":        "Cobrar este pedido a",
  "cash_order":       "Orden en efectivo",
  "credit_order":     "Orden a crédito",
  "amount_paid":      "Monto pagado",
  "complete_sale":    "Completar venta",
  "select_customer":  "Seleccionar cliente",
  "new_customer":     "Nuevo cliente",
  "charge_credit":    "Cobrar al crédito",

  // ── Wallet ────────────────────────────────────────────────────────────────
  "wallet_balance":   "Saldo de billetera",
  "records":          "Registros",
  "no_records":       "Sin registros aún.",
  "cash_colon_sale":  "Efectivo: Venta",
  "cleared_to_owner": "Transferido al dueño",
  "statement":        "Estado de cuenta",
  "download_pdf":     "Descargar PDF",
  "delete_this_sale": "Eliminar esta venta",

  // ── Credit ────────────────────────────────────────────────────────────────
  "credit_accounts":  "Cuentas de crédito",
  "opened_tab":       "Abiertas",
  "closed_tab":       "Cerradas",
  "create_tab":       "Crear",
  "balance_owed":     "Saldo pendiente",
  "full_name":        "Nombre completo",
  "contact_number":   "Número de contacto",
  "id_number":        "Número de ID",
  "id_type":          "Tipo de ID",
  "drivers_permit":   "Licencia de conducir",
  "national_id":      "Cédula de identidad",
  "new_credit_acct":  "Nueva cuenta de crédito",
  "create_account":   "Crear cuenta",
  "create_and_charge":"Crear y cobrar",
  "creating":         "Creando…",
  "customer_created": "Cliente creado. Ver en pestaña Cerradas.",
  "add_payment":      "Agregar pago",
  "payment_amount":   "Monto del pago",
  "record_payment":   "Registrar pago",
  "no_credit_open":   "No hay cuentas abiertas.",
  "no_credit_closed": "No hay cuentas cerradas.",
  "full_history":     "Historial completo",
  "bill":             "Factura",
  "download_pdf_btn": "Descargar PDF",
  "share_whatsapp":   "Compartir por WhatsApp",
  "delete_customer":  "¿Eliminar cliente?",
  "delete_customer_msg": "y todos sus registros serán eliminados permanentemente.",
  "no_records_yet":   "Sin registros",
  "charge":           "CARGO",
  "payment":          "PAGO",
  "credit_charge":    "Cargo a crédito",
  "payment_received": "Pago recibido",

  // ── Machines ─────────────────────────────────────────────────────────────
  "machines_title":   "Máquinas",
  "payout":           "Pago",
  "income":           "Ingreso",
  "history":          "Historial",
  "save_payout":      "Guardar pago",
  "save_income":      "Guardar",
  "float_empty":      "Sin float",
  "float_set":        "Float establecido",
  "set_float":        "Establecer float",
  "update_float":     "Actualizar float",
  "session_float":    "Float de sesión",
  "session_payout":   "Pago de sesión",
  "remaining":        "Restante",
  "all_time_payout":  "Pago total",
  "all_time_income":  "Ingreso total",
  "all_time_profit":  "Ganancia total",
  "proof_photo":      "Foto de prueba",
  "photo_captured":   "Foto capturada",
  "snap":             "📸 Capturar",
  "save_payout_confirm": "¿Guardar pago?",
  "confirm_payout_msg":  "Confirmar guardar un pago de",
  "float_empty_msg":  "El float está vacío — establece un nuevo float antes de registrar un pago",
  "payout_recorded":  "Pago registrado",
  "amount_recorded":  "Monto registrado",
  "record_deleted":   "Registro eliminado",
  "set_alerts":       "Alertas",
  "all_history":      "Todo el historial",
  "screens":          "Pantallas",
  "create_machine":   "Crear",
  "machine_name":     "Nombre de máquina",
  "add_machine":      "Agregar máquina",
  "delete_machine":   "Eliminar máquina",
  "hold_to_sort":     "Mantén presionada para ordenar",
  "upgrade":          "MEJORAR",
  "machines_addon":   "Complemento de máquinas",
  "upgrade_premium":  "Mejorar a Premium",
  "go_to_billing_arrow": "Toca para ir a Facturación →",

  // ── Billing ───────────────────────────────────────────────────────────────
  "billing_title":    "Facturación",
  "choose_plan":      "Elige tu plan",
  "addons":           "Complementos",
  "payment_method":   "Método de pago",
  "confirm_payment":  "Confirmar pago",
  "order_summary":    "Resumen del pedido",
  "cash_payment":     "Pago en efectivo",
  "bank_transfer":    "Transferencia bancaria",
  "payment_pending":  "Pago pendiente",
  "reference_number": "Número de referencia",
  "cancel_payment":   "Cancelar pago",
  "payment_history":  "Historial de pagos",
  "no_payments_yet":  "Sin pagos aún",
  "basic_plan":       "Plan Básico",
  "premium_plan":     "Plan Premium",
  "get_started":      "Comenzar",
  "subscription_expired": "Suscripción vencida",
  "renew_subscription":   "Renovar suscripción →",
  "select_basic":     "Seleccionar Básico",
  "select_premium":   "Seleccionar Premium",
  "billed_annually":  "Facturado anualmente",
  "agent_setup":      "Visita de configuración y capacitación",
  "tablet_addon":     "Tablet Android (preinstalada)",
  "optional_addons":  "Complementos opcionales (solo primer pago):",
  "total_due":        "Total a pagar",
  "how_to_pay":       "¿Cómo deseas pagar?",
  "submitting":       "Enviando…",
  "payment_submitted":"Pago enviado — esperando confirmación del admin",
  "activates_once":   "Tu suscripción se activa cuando el admin confirme el pago.",
  "renewal_opens":    "La renovación abre",
  "days_before":      "días antes de la fecha límite",
  "renewal_opens_msg":"Renovación abre",
  "machines_addon_plan": "Complemento de máquinas",
  "add_machines_tracker": "Agregar rastreador de máquinas",
  "keep_basic_add":   "Mantén Básico + agrega Máquinas — $600 TT/año por separado",

  // ── Cashiers ──────────────────────────────────────────────────────────────
  "cashiers_title":   "Cajeros",
  "add_cashier":      "Agregar cajero",
  "cashier_name":     "Nombre del cajero",
  "cashier_password": "Contraseña",
  "wallet_balance_lbl": "Saldo de billetera",
  "clear_to_owner":   "Transferir al dueño",
  "no_cashiers":      "No hay cajeros aún.",
  "delete_cashier":   "Eliminar cajero",
  "clear_wallet":     "Vaciar billetera",
  "transfer_amount":  "Monto a transferir",

  // ── Products ──────────────────────────────────────────────────────────────
  "products_title":   "Productos",
  "add_product":      "Agregar producto",
  "product_name":     "Nombre del producto",
  "price":            "Precio",
  "stock":            "Stock",
  "cost_price":       "Precio de costo",
  "no_products_yet":  "Sin productos aún.",
  "delete_product":   "¿Eliminar producto?",
  "save_product":     "Guardar producto",
  "take_photo":       "Tomar foto",

  // ── Profile ───────────────────────────────────────────────────────────────
  "profile_title":    "Perfil",
  "change_password":  "Cambiar contraseña",
  "current_password": "Contraseña actual",
  "new_password":     "Nueva contraseña",
  "confirm_password": "Confirmar contraseña",
  "delete_account":   "Eliminar cuenta",
  "save_changes":     "Guardar cambios",
  "account_details":  "Detalles de la cuenta",
  "danger_zone":      "Zona de peligro",

  // ── Music ─────────────────────────────────────────────────────────────────
  "music_title":      "Música",
  "now_playing":      "Reproduciendo ahora",
  "playlist":         "Lista de reproducción",
  "history_tab":      "Historial",
  "youtube":          "YouTube",
  "local":            "Local",
  "search_youtube":   "Buscar en YouTube…",
  "no_results":       "Sin resultados",
  "daily_limit":      "Límite diario alcanzado",
  "searches_left":    "búsquedas restantes",
  "resets_in":        "Reinicia en",
  "play":             "Reproducir",
  "pause":            "Pausar",
  "next_track":       "Siguiente",
  "prev_track":       "Anterior",
  "shuffle":          "Aleatorio",
  "repeat":           "Repetir",
  "clear_history":    "Limpiar historial",

  // ── Language page ─────────────────────────────────────────────────────────
  "language_title":   "Idioma",
  "select_language":  "Seleccionar idioma",
  "english":          "English",
  "spanish":          "Español",
  "language_saved":   "Idioma guardado",

  // ── Factory reset ─────────────────────────────────────────────────────────
  "factory_reset_title": "Restaurar fábrica",
  "reset_bar":        "Resetear bar",
  "reset_machines":   "Resetear máquinas",
  "reset_everything": "Resetear todo",
  "reset_confirm":    "¿Estás seguro? Esta acción no se puede deshacer.",

  // ── Account status screens ────────────────────────────────────────────────
  "account_expelled": "Cuenta expulsada",
  "account_suspended":"Cuenta suspendida",
  "awaiting_approval":"Esperando aprobación",
  "account_pending_msg": "Tu cuenta está pendiente de aprobación del administrador.",
  "billing_setup_msg":"Completa tu configuración de facturación para activar tu cuenta.",
  "expelled_msg":     "Tu cuenta ha sido expulsada. Ya no tienes acceso a Bartendaz Pro.",
  "suspended_msg":    "Tu suscripción ha vencido o tu cuenta ha sido suspendida. Renueva tu suscripción o contacta al admin.",

  // ── Errors / toasts ───────────────────────────────────────────────────────
  "error_generic":    "Algo salió mal",
  "copied":           "Copiado",
  "saved":            "Guardado",
  "deleted":          "Eliminado",
  "failed":           "Error",
  "enter_valid_amount": "Ingresa un monto válido",
  "pdf_saved":        "PDF guardado en Documentos",
  "pdf_downloaded":   "PDF descargado",
  "share_failed":     "Error al compartir",
  "download_failed":  "Error al descargar",

  // ── Admin ─────────────────────────────────────────────────────────────────
  "billing_management": "Gestión de facturación",
  "pending_payments": "Pagos pendientes",
  "approved_payments":"Pagos aprobados",
  "total_revenue":    "Ingresos totales",
  "payment_details":  "Detalles del pago",
  "admin_notes":      "Notas del admin",
  "notes_optional":   "Notas (opcional)",
  "no_payments_found":"Sin pagos encontrados",
};

// ── Context ───────────────────────────────────────────────────────────────────
type I18nCtx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, fallback?: string) => string;
};

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(LS_KEY);
    return (saved === "es" ? "es" : "en") as Lang;
  });

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(LS_KEY, l);
    setLangState(l);
  }, []);

  const t = useCallback((key: string, fallback?: string): string => {
    if (lang === "en") return fallback ?? key.replace(/_/g, " ");
    return ES[key] ?? fallback ?? key.replace(/_/g, " ");
  }, [lang]);

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useTranslation() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTranslation must be inside I18nProvider");
  return ctx;
}
