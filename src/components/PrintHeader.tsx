import React from 'react';
import type { User } from '../types/erp.js';

/**
 * ترويسة التقارير المطبوعة (من ملف شعارات النقابة)
 * مخفية على الشاشة وتظهر تلقائياً أعلى كل صفحة مطبوعة (window.print)
 */
interface PrintHeaderProps {
  reportTitle: string;
  organizationName?: string;
  currentUser?: User | null;
}

export const PrintHeader: React.FC<PrintHeaderProps> = ({
  reportTitle,
  organizationName = 'النقابة العامة',
  currentUser,
}) => {
  const now = new Date();
  const dateStr = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="print-header hidden print:block w-full mb-4 border-b-2 border-black pb-2">
      <div className="flex items-center justify-between gap-4">
        {/* الشعار يمين الصفحة */}
        <img
          src="/assets/logos/letterhead-top.png"
          alt="شعار النقابة"
          className="h-20 w-auto object-contain"
        />

        {/* عنوان الجهة والتقرير في الوسط */}
        <div className="flex-1 text-center">
          <div className="text-[15px] font-bold text-black leading-6">{organizationName}</div>
          <div className="text-[13px] font-semibold text-black mt-1">{reportTitle}</div>
          <div className="text-[10px] text-black mt-0.5">نظام Union Financial ERP — الإدارة المالية والحسابات</div>
        </div>

        {/* بيانات الطباعة يسار الصفحة */}
        <div className="text-[9.5px] text-black text-left leading-4 min-w-[130px]">
          <div><span className="font-bold">تاريخ الطباعة:</span> {dateStr}</div>
          <div><span className="font-bold">الوقت:</span> {timeStr}</div>
          <div><span className="font-bold">المستخدم:</span> {currentUser?.fullName || '—'}</div>
          <div><span className="font-bold">الصفة:</span> {currentUser?.roleLabelAr || currentUser?.role || '—'}</div>
        </div>
      </div>
    </div>
  );
};
