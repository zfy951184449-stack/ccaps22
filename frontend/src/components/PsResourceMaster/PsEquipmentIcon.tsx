/**
 * 工厂沙盘设备图标(锁定图标库,inline SVG)。形状即信息——不读字也认得出。
 * 中性灰填充(形状管「是什么」),CIP 站绿(公用);颜色类在 PsFactorySandtablePage.css。
 * reactor 按 stirDirection 画上/下搅拌;尺寸大小由外层 width/height 控制(见 PS_SIZE_SCALE)。
 */
import React from 'react';
import type { PsEquipmentType, PsStirDirection } from '../../types/psSandtable';

interface Props {
  type: PsEquipmentType;
  stirDirection?: PsStirDirection;
  size?: number; // 渲染像素边长,默认 48
  title?: string;
}

/** 各类型的 viewBox 0..100 内的图标几何(类名:psi-ink / psi-ink2 / psi-vessel / psi-cip) */
function glyph(type: PsEquipmentType, stir: PsStirDirection): React.ReactNode {
  switch (type) {
    case 'reactor':
      return stir === 'bottom' ? (
        <>
          <path className="psi-vessel" d="M28,28 Q28,18 40,18 L60,18 Q72,18 72,28 L72,54 Q72,78 50,78 Q28,78 28,54 Z" />
          <path className="psi-ink" d="M50,18 L50,9 M44,9 L56,9" />
          <rect className="psi-ink" x="43" y="84" width="14" height="10" rx="2" />
          <path className="psi-ink" d="M50,84 L50,58" />
          <path className="psi-ink" d="M40,56 L50,62 L60,56" />
        </>
      ) : (
        <>
          <path className="psi-vessel" d="M28,34 Q28,24 40,24 L60,24 Q72,24 72,34 L72,60 Q72,86 50,86 Q28,86 28,60 Z" />
          <rect className="psi-ink" x="43" y="8" width="14" height="10" rx="2" />
          <path className="psi-ink" d="M50,18 L50,62" />
          <path className="psi-ink" d="M40,58 L50,64 L60,58" />
        </>
      );
    case 'centrifuge':
      return (
        <>
          <rect className="psi-vessel" x="24" y="72" width="52" height="12" rx="2" />
          <path className="psi-vessel" d="M34,32 Q34,26 50,26 Q66,26 66,32 L66,52 L50,66 L34,52 Z" />
          <path className="psi-ink2" d="M50,26 L50,15 M44,15 L56,15 M66,40 L80,40 M50,66 L50,72" />
          <path className="psi-ink2" d="M40,38 A11,11 0 0 1 60,38 M60,38 L56,35 M60,38 L55,41" />
        </>
      );
    case 'wave':
      return (
        <>
          <rect className="psi-vessel" x="22" y="72" width="56" height="11" rx="2" />
          <path className="psi-ink2" d="M50,72 L50,62" />
          <g transform="rotate(-13 50 52)">
            <rect className="psi-vessel" x="24" y="50" width="52" height="9" rx="2" />
            <path className="psi-vessel" d="M30,50 Q28,38 40,38 L60,38 Q72,38 70,50 Z" />
          </g>
          <path className="psi-ink2" d="M32,30 Q50,20 68,30 M32,30 L36,27 M32,30 L35,34 M68,30 L64,27 M68,30 L65,34" />
        </>
      );
    case 'shaker':
      return (
        <>
          <rect className="psi-vessel" x="20" y="68" width="60" height="14" rx="2" />
          <rect className="psi-ink2" x="24" y="60" width="52" height="8" rx="1" />
          <rect className="psi-ink2" x="35" y="32" width="5" height="8" />
          <path className="psi-vessel" d="M33,40 L28,60 L47,60 L42,40 Z" />
          <rect className="psi-ink2" x="56" y="32" width="5" height="8" />
          <path className="psi-vessel" d="M54,40 L49,60 L68,60 L63,40 Z" />
          <path className="psi-ink2" d="M44,90 A8,4 0 1 1 56,90 M56,90 L52,88 M56,90 L53,93" />
        </>
      );
    case 'prep-tank':
      return (
        <>
          <path className="psi-vessel" d="M30,32 Q30,24 50,24 Q70,24 70,32 L70,74 Q70,82 62,82 L38,82 Q30,82 30,74 Z" />
          <rect className="psi-ink" x="43" y="6" width="14" height="10" rx="2" />
          <path className="psi-ink" d="M50,16 L50,56" />
          <path className="psi-ink2" d="M40,52 L50,58 L60,52 M44,58 L56,58" />
        </>
      );
    case 'storage-tank':
      return (
        <>
          <path className="psi-vessel" d="M30,30 Q30,22 50,22 Q70,22 70,30 L70,80 L30,80 Z" />
          <path className="psi-ink2" d="M50,22 L50,12 M44,12 L56,12 M38,80 L35,90 M62,80 L65,90" />
        </>
      );
    case 'storage-bag':
      return (
        <>
          <rect className="psi-ink2" x="22" y="28" width="56" height="58" rx="4" />
          <path className="psi-vessel" d="M32,42 Q30,36 38,36 L62,36 Q70,36 68,42 L68,72 Q70,80 62,80 L38,80 Q30,80 32,72 Z" />
          <path className="psi-ink2" d="M44,36 L44,28 M56,36 L56,28" />
        </>
      );
    case 'chromatography-skid':
      return (
        <>
          <rect className="psi-vessel" x="18" y="64" width="64" height="18" rx="3" />
          <rect className="psi-vessel" x="37" y="20" width="16" height="44" rx="8" />
          <path className="psi-ink2" d="M45,24 L45,60" />
          <rect className="psi-ink2" x="60" y="42" width="14" height="22" rx="2" />
          <path className="psi-ink2" d="M45,20 Q45,14 60,14 L60,42" />
          <path className="psi-ink2" d="M28,82 L28,90 M72,82 L72,90" />
        </>
      );
    case 'ufdf-skid':
      return (
        <>
          <rect className="psi-vessel" x="16" y="70" width="68" height="14" rx="2" />
          <rect className="psi-vessel" x="28" y="28" width="7" height="40" rx="1" />
          <rect className="psi-vessel" x="63" y="28" width="7" height="40" rx="1" />
          <rect className="psi-vessel" x="38" y="32" width="4" height="32" />
          <rect className="psi-vessel" x="44" y="32" width="4" height="32" />
          <rect className="psi-vessel" x="50" y="32" width="4" height="32" />
          <rect className="psi-vessel" x="56" y="32" width="4" height="32" />
          <path className="psi-ink2" d="M27,33 L71,33 M27,63 L71,63" />
          <circle className="psi-ink2" cx="24" cy="34" r="4" />
          <circle className="psi-ink2" cx="74" cy="34" r="4" />
          <circle className="psi-ink" cx="26" cy="64" r="6" />
          <path className="psi-ink2" d="M23,61 L30,64 L23,67 Z" />
          <path className="psi-ink2" d="M28,84 L28,91 M72,84 L72,91" />
        </>
      );
    case 'bsc':
      return (
        <>
          <rect className="psi-vessel" x="24" y="22" width="52" height="62" rx="2" />
          <rect className="psi-ink" x="30" y="13" width="40" height="9" rx="1" />
          <rect className="psi-ink2" x="30" y="26" width="40" height="20" />
          <path className="psi-ink2" d="M30,26 L70,46 M30,58 L70,58 M34,72 L34,80 M42,72 L42,80 M50,72 L50,80 M58,72 L58,80 M66,72 L66,80" />
        </>
      );
    case 'laf':
      return (
        <>
          <rect className="psi-vessel" x="22" y="16" width="56" height="13" rx="2" />
          <path className="psi-ink2" d="M30,16 L30,29 M40,16 L40,29 M50,16 L50,29 M60,16 L60,29 M70,16 L70,29" />
          <path className="psi-ink" d="M26,29 L26,82 M74,29 L74,82" />
          <rect className="psi-vessel" x="24" y="80" width="52" height="6" rx="1" />
          <path className="psi-ink2" d="M36,34 L36,66 M36,66 L33,61 M36,66 L39,61 M50,34 L50,66 M50,66 L47,61 M50,66 L53,61 M64,34 L64,66 M64,66 L61,61 M64,66 L67,61" />
        </>
      );
    case 'cip-station':
      return (
        <>
          <rect className="psi-vessel" x="16" y="72" width="68" height="12" rx="2" />
          <rect className="psi-cip" x="24" y="30" width="26" height="42" rx="5" />
          <path className="psi-ink2" d="M37,30 L37,22 M27,50 L47,50 M27,58 L31,60 L27,62 L31,64" />
          <circle className="psi-ink" cx="64" cy="60" r="8" />
          <path className="psi-ink2" d="M60,56 L68,60 L60,64 Z" />
          <path className="psi-ink2" d="M50,40 L72,40 L72,52 M64,52 L72,52 M64,68 L64,72 M37,72 L37,66" />
        </>
      );
    default:
      return null;
  }
}

export const PsEquipmentIcon: React.FC<Props> = ({ type, stirDirection = 'top', size = 48, title }) => (
  <svg
    className="psi"
    viewBox="0 0 100 100"
    width={size}
    height={size}
    role="img"
    aria-label={title ?? type}
  >
    {title ? <title>{title}</title> : null}
    {glyph(type, stirDirection)}
  </svg>
);

export default PsEquipmentIcon;
