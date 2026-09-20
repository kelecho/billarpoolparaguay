import { useId, useState } from 'react';
import { Download, EllipsisVertical, MonitorDown, Share, SquarePlus } from 'lucide-react';
import type { Platform } from '../useInstall';

const TABS: { platform: Platform; label: string }[] = [{ platform: 'ios', label: 'iPhone o iPad' }, { platform: 'android', label: 'Android' }, { platform: 'desktop', label: 'Computadora' }];

/** Guía paso a paso. Muestra las tres plataformas para que alguien pueda orientar a otra persona con otro teléfono. */
export default function InstallGuide({ platform, canPrompt, onInstall }: { platform: Platform; canPrompt: boolean; onInstall: () => void }) {
  const [shown, setShown] = useState(platform);
  const tabs = useId();
  const oneTap = canPrompt && shown === platform && shown !== 'ios';
  return (
    <div className="form-stack install-guide">
      <p className="muted">Queda como una aplicación más: con su icono, a pantalla completa y con el último ranking disponible aunque no haya señal. No ocupa casi espacio ni pasa por la tienda de aplicaciones.</p>
      <div className="category-tabs" role="tablist" aria-label="Tipo de dispositivo">
        {TABS.map(tab => <button key={tab.platform} type="button" role="tab" id={`${tabs}-${tab.platform}`} aria-selected={shown === tab.platform} aria-controls={`${tabs}-panel`} className={shown === tab.platform ? 'selected' : undefined} onClick={() => setShown(tab.platform)}>{tab.label}</button>)}
      </div>
      <div id={`${tabs}-panel`} role="tabpanel" aria-labelledby={`${tabs}-${shown}`} className="form-stack">
        {oneTap && <button className="button primary" type="button" onClick={onInstall}><Download size={17} />Instalar ahora</button>}
        {oneTap && <p className="muted small">Si el botón no responde, seguí estos pasos:</p>}
        {shown === 'ios' && <ol className="install-steps">
          <li><span>Abrí esta página en <strong>Safari</strong>. Desde WhatsApp, Instagram o Facebook no aparece la opción: tocá «Abrir en Safari» o copiá el enlace.</span></li>
          <li><Share size={20} aria-hidden="true" /><span>Tocá <strong>Compartir</strong>: el cuadrado con una flecha hacia arriba, en la barra de abajo.</span></li>
          <li><SquarePlus size={20} aria-hidden="true" /><span>Deslizá la lista hacia abajo y elegí <strong>«Agregar a inicio»</strong>.</span></li>
          <li><span>Tocá <strong>«Agregar»</strong>, arriba a la derecha. El icono de Pool Paraguay aparece en tu pantalla de inicio.</span></li>
        </ol>}
        {shown === 'android' && <ol className="install-steps">
          <li><span>Abrí esta página en <strong>Chrome</strong>. Desde WhatsApp, Instagram o Facebook, tocá los tres puntos y elegí «Abrir en Chrome».</span></li>
          <li><EllipsisVertical size={20} aria-hidden="true" /><span>Tocá los <strong>tres puntos</strong>, arriba a la derecha.</span></li>
          <li><Download size={20} aria-hidden="true" /><span>Elegí <strong>«Instalar app»</strong> o <strong>«Agregar a la pantalla principal»</strong>.</span></li>
          <li><span>Confirmá con <strong>«Instalar»</strong>. El icono de Pool Paraguay aparece junto a tus otras aplicaciones.</span></li>
        </ol>}
        {shown === 'desktop' && <ol className="install-steps">
          <li><span>Abrí esta página en <strong>Chrome</strong> o <strong>Edge</strong>.</span></li>
          <li><MonitorDown size={20} aria-hidden="true" /><span>Hacé clic en el icono de <strong>instalar</strong>, a la derecha de la barra de direcciones.</span></li>
          <li><span>Confirmá con <strong>«Instalar»</strong>. Se abre en su propia ventana y queda en el menú de aplicaciones.</span></li>
        </ol>}
      </div>
    </div>
  );
}
