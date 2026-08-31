import React, { useState, useEffect } from 'react';
import {
  Users,
  PlusCircle,
  Award,
  CheckCircle2,
  Printer,
  ShieldCheck,
  Calendar,
  Building
} from 'lucide-react';
import { api } from '../services/api.js';
import { hasPerm } from '../utils/permissions.js';
import { Member, MembershipCertificate, User } from '../types/erp.js';
import { Modal } from '../components/Modal.js';
import { Combobox } from '../components/Combobox.js';
import { QRCodeModal } from '../components/QRCodeModal.js';

interface MembersProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (type: 'success' | 'error' | 'warning' | 'info', msg: string) => void;
}

export const Members: React.FC<MembersProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [qrModalData, setQrModalData] = useState<any>(null);

  // New Member Form
  const [fullName, setFullName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [profession, setProfession] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    loadMembers();
  }, [organizationId]);

  const loadMembers = async () => {
    setLoading(true);
    try {
      const data = await api.getMembers();
      setMembers(data);
    } catch (err: any) {
      onShowToast('error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !nationalId) {
      onShowToast('error', 'الاسم والرقم القومي حقول إلزامية.');
      return;
    }

    try {
      const newMember = await api.createMember({
        fullName,
        nationalId,
        profession,
        companyName,
        phone,
        syndicateCommitteeId: organizationId,
      });

      onShowToast('success', `تم تسجيل العضوية برقم قيد [${newMember.membershipNumber}] بنجاح.`);
      setIsRegisterModalOpen(false);
      setFullName('');
      setNationalId('');
      setProfession('');
      setCompanyName('');
      setPhone('');
      loadMembers();
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const handleIssueCertificate = async (member: Member) => {
    try {
      const cert = await api.issueCertificate(member.id);
      onShowToast('success', `تم إصدار وتجديد الشهادة برقم [${cert.certificateNumber}] صالحة حتى ${cert.expiryDate}.`);
      loadMembers();

      setQrModalData({
        type: 'CERTIFICATE',
        number: cert.certificateNumber,
        date: cert.issueDate,
        expiryDate: cert.expiryDate,
        entityName: member.syndicateCommitteeName,
        beneficiaryName: member.fullName,
        token: cert.verificationToken,
        notes: `شهادة قيد وتجديد عضوية نقابية سارية المفعول برقم عضوية: ${member.membershipNumber}`,
      });
    } catch (err: any) {
      onShowToast('error', err.message);
    }
  };

  const filteredMembers = members.filter((m) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        m.fullName.toLowerCase().includes(q) ||
        m.membershipNumber.toLowerCase().includes(q) ||
        m.companyName?.toLowerCase().includes(q) ||
        m.nationalIdMasked.includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-100">سجل الأعضاء والشهادات النقابية الرسمية</h2>
          </div>
          <p className="text-xs text-slate-400">
            قيد الأعضاء باللجان النقابية، حفظ الأرقام القومية مشفرة برمجياً، وإصدار وتجديد شهادات العضوية بختم QR.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {hasPerm(currentUser, 'members:manage') && (
          <button
            onClick={() => setIsRegisterModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>تسجيل عضوية جديدة</span>
          </button>
          )}
        </div>
      </div>

      {/* Search & Members Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Combobox
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="بحث بالاسم، رقم القيد النقابي، أو الشركة..."
            options={members.map((m) => ({
              id: m.id,
              label: m.fullName,
              sub: `${m.membershipNumber}${m.companyName ? ' — ' + m.companyName : ''}`,
            }))}
            className="relative flex-1 max-w-md"
            inputClassName="w-full pl-4 pr-10 py-2 bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 outline-hidden"
          />
          <span className="text-xs text-slate-400 font-bold">{filteredMembers.length} عضو نقابي</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          {filteredMembers.map((member) => (
            <div
              key={member.id}
              className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between space-y-3 hover:border-slate-700 transition-all"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-[10px] text-emerald-400 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                      {member.membershipNumber}
                    </span>
                    <h3 className="font-bold text-sm text-slate-100 mt-1">{member.fullName}</h3>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">{member.nationalIdMasked}</span>
                </div>

                <div className="mt-3 text-xs space-y-1 text-slate-400">
                  <div>المهنة: <strong className="text-slate-200">{member.profession || '-'}</strong></div>
                  <div>الجهة / الشركة: <strong className="text-slate-200">{member.companyName || '-'}</strong></div>
                  <div>اللجنة النقابية: <strong className="text-emerald-400">{member.syndicateCommitteeName}</strong></div>
                  {member.lastCertificateExpiry && (
                    <div className="text-[11px] text-amber-400 font-bold pt-1">
                      صلاحية الشهادة: حتى {member.lastCertificateExpiry}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleIssueCertificate(member)}
                  className="flex-1 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>إصدار / تجديد الشهادة</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* REGISTER MEMBER MODAL */}
      <Modal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        title="تسجيل وقيد عضو نقابي جديد"
        subtitle="حماية البيانات الشخصية وتوليد رقم العضوية الموحد"
        maxWidth="md"
      >
        <form onSubmit={handleRegisterSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">الاسم الرباعي للعضو:</label>
            <input
              type="text"
              required
              placeholder="مثال: المهندس أحمد محمود السيد علي..."
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">الرقم القومي (14 رقم - يشفر فورياً):</label>
            <input
              type="text"
              required
              maxLength={14}
              placeholder="290XXXXXXXXXXX"
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 outline-hidden focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">المهنة / التخصص:</label>
              <input
                type="text"
                placeholder="مهندس مدني / فني تشغيل..."
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">الشركة / مكان العمل:</label>
              <input
                type="text"
                placeholder="شركة بترول بلاعيم..."
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">رقم الهاتف المحمول:</label>
            <input
              type="text"
              placeholder="01XXXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 outline-hidden"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={() => setIsRegisterModalOpen(false)}
              className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg"
            >
              حفظ وقيد العضوية
            </button>
          </div>
        </form>
      </Modal>

      {/* QR Certificate Modal */}
      <QRCodeModal
        isOpen={Boolean(qrModalData)}
        onClose={() => setQrModalData(null)}
        title="شهادة قيد وتجديد عضوية نقابية رسمية"
        data={qrModalData}
      />
    </div>
  );
};
