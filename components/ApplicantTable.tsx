"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, ExternalLink, Eye, Loader2 } from "lucide-react";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

export interface Submission {
    id: string;
    applicant_name: string;
    applicant_email: string;
    applicant_nim: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    answers: Record<string, any>;
    files: string[];
    submitted_at: string;
}

export function ApplicantTable({ submissions, recruitmentTitle, recruitmentId, currentPage = 1, totalPages = 1 }: { submissions: Submission[]; recruitmentTitle: string; recruitmentId: string; currentPage?: number; totalPages?: number; }) {
    const router = useRouter();
    const supabase = createClient();
    const { toast } = useToast();

    const [isExportingZip, setIsExportingZip] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [exportMessage, setExportMessage] = useState("");

    const exportAllFilesToZip = async () => {
        setIsExportingZip(true);
        setExportProgress(0);
        setExportMessage("Mempersiapkan pengunduhan...");

        try {
            const { data: allSubmissions, error } = await supabase
                .from("submissions")
                .select("applicant_name, applicant_nim, files")
                .eq("recruitment_id", recruitmentId);

            if (error) throw error;

            if (!allSubmissions || allSubmissions.length === 0) {
                toast({ title: "Informasi", description: "Belum ada pendaftar untuk diexport." });
                setIsExportingZip(false);
                return;
            }

            const submissionsWithFiles = allSubmissions.filter(sub => sub.files && sub.files.length > 0);

            if (submissionsWithFiles.length === 0) {
                toast({ title: "Informasi", description: "Tidak ada file yang diupload oleh pendaftar." });
                setIsExportingZip(false);
                return;
            }

            const zip = new JSZip();
            const safeRecruitmentName = recruitmentTitle.replace(/[^a-zA-Z0-9 -]/g, "").replace(/\s+/g, "_");
            const folderName = `OPREC_${safeRecruitmentName}`;
            const rootFolder = zip.folder(folderName);

            let totalFiles = 0;
            submissionsWithFiles.forEach(sub => totalFiles += sub.files.length);

            let downloadedFiles = 0;
            let successCount = 0;
            let errorCount = 0;

            for (const sub of submissionsWithFiles) {
                const safeName = sub.applicant_name.replace(/[^a-zA-Z0-9 ]/g, "").trim();
                const safeNim = sub.applicant_nim.replace(/[^0-9]/g, "");
                const applicantFolderName = `${safeNim}_${safeName}`;
                const applicantFolder = rootFolder!.folder(applicantFolderName);

                for (let i = 0; i < sub.files.length; i++) {
                    const fileUrl = sub.files[i];
                    try {
                        const response = await fetch(fileUrl);
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        const blob = await response.blob();

                        let fileName = fileUrl.split('/').pop() || `file_${i + 1}`;
                        fileName = fileName.split('?')[0];
                        fileName = decodeURIComponent(fileName);
                        fileName = fileName.replace(/^\d+-/, ''); // Strip timestamp

                        applicantFolder!.file(fileName, blob);
                        successCount++;
                    } catch (err) {
                        console.error("Fetch error for file: ", fileUrl, err);
                        errorCount++;
                    }
                    downloadedFiles++;
                    setExportProgress((downloadedFiles / totalFiles) * 100);
                    setExportMessage(`Mengunduh file ${downloadedFiles} dari ${totalFiles}...`);
                }
            }

            setExportMessage("Membuat file ZIP...");
            const content = await zip.generateAsync({ type: "blob" });

            const dateStr = new Date().toISOString().split('T')[0];
            saveAs(content, `${folderName}_${dateStr}.zip`);

            if (errorCount > 0) {
                toast({
                    title: "Selesai dengan Catatan",
                    description: `Berhasil mengunduh ${successCount} file. Gagal mengunduh ${errorCount} file.`,
                    variant: "destructive"
                });
            } else {
                toast({
                    title: "Berhasil!",
                    description: "Semua file berhasil diunduh! 🙏",
                });
            }
        } catch (error) {
            console.error(error);
            toast({
                title: "Gagal Mengunduh",
                description: "Terjadi kesalahan saat memproses ekspor file ZIP.",
                variant: "destructive"
            });
        } finally {
            setIsExportingZip(false);
            setExportMessage("");
            setExportProgress(0);
        }
    };

    const exportToCSV = async () => {
        // Fetch all submissions for this recruitment
        const { data: allSubmissions } = await supabase
            .from("submissions")
            .select("id, applicant_name, applicant_email, applicant_nim, submitted_at, answers, files")
            .eq("recruitment_id", recruitmentId)
            .order("submitted_at", { ascending: false });

        if (!allSubmissions) return;

        // Flatten data for CSV
        const data = allSubmissions.map((sub, i) => {
            const flat: Record<string, string | number> = {
                No: i + 1,
                Nama: sub.applicant_name,
                NIM: sub.applicant_nim,
                Email: sub.applicant_email,
                "Tanggal Daftar": new Date(sub.submitted_at).toLocaleString("id-ID"),
            };

            // Add dynamic answers
            if (sub.answers) {
                Object.entries(sub.answers).forEach(([k, v]) => {
                    flat[k] = Array.isArray(v) ? v.join(", ") : String(v);
                });
            }

            // Add files
            if (sub.files && sub.files.length > 0) {
                flat.Files = sub.files.join(", ");
            }
            return flat;
        });

        const csv = Papa.unparse(data);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `Data Pendaftar - ${recruitmentTitle.replace(/\\s+/g, '-')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-2xl border-2 border-border shadow-sm mb-4 gap-4">
                <div className="w-full sm:w-1/2 flex items-center space-x-4">
                    {isExportingZip && (
                        <div className="w-full flex-1">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-semibold text-primary">{exportMessage}</span>
                                <span className="text-xs text-muted-foreground">{Math.round(exportProgress)}%</span>
                            </div>
                            <Progress value={exportProgress} className="h-2 bg-accent/20" />
                        </div>
                    )}
                </div>
                <div className="flex space-x-3 w-full sm:w-auto justify-end">
                    <Button
                        onClick={exportAllFilesToZip}
                        disabled={isExportingZip}
                        className="bg-[#FAF6F0] text-primary border-2 border-primary hover:bg-[#F5E6C8] shadow-sm rounded-xl px-6 transition-colors"
                    >
                        {isExportingZip ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        Export Semua File (.zip)
                    </Button>
                    <Button onClick={exportToCSV} className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm rounded-xl px-6">
                        <Download className="w-4 h-4 mr-2" />
                        Export CSV
                    </Button>
                </div>
            </div>

            <div className="rounded-2xl border-2 border-border bg-white shadow-sm overflow-hidden">
                <Table>
                    <TableHeader className="bg-[#FAF6F0] border-b-2 border-border">
                        <TableRow>
                            <TableHead className="w-[50px] font-bold text-foreground font-serif">No</TableHead>
                            <TableHead className="font-bold text-foreground font-serif">Nama</TableHead>
                            <TableHead className="font-bold text-foreground font-serif">NIM</TableHead>
                            <TableHead className="font-bold text-foreground font-serif">Prodi</TableHead>
                            <TableHead className="font-bold text-foreground font-serif">Angkatan</TableHead>
                            <TableHead className="font-bold text-foreground font-serif">Tanggal Daftar</TableHead>
                            <TableHead className="text-right font-bold text-foreground font-serif">Aksi</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {submissions.map((sub, index) => (
                            <TableRow key={sub.id} className="hover:bg-[#F5E6C8]/30 transition-colors border-b border-border/50">
                                <TableCell className="font-medium">{index + 1}</TableCell>
                                <TableCell className="font-medium text-primary">{sub.applicant_name}</TableCell>
                                <TableCell>{sub.applicant_nim}</TableCell>
                                <TableCell>{sub.answers?.["Program Studi"] || "-"}</TableCell>
                                <TableCell>{sub.answers?.["Angkatan"] || "-"}</TableCell>
                                <TableCell>{new Date(sub.submitted_at).toLocaleDateString("id-ID")}</TableCell>
                                <TableCell className="text-right">
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="outline" size="sm" className="border-accent text-accent-foreground hover:bg-[#F5E6C8] rounded-lg">
                                                <Eye className="w-4 h-4 mr-1" /> Detail
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-background border-2 border-accent rounded-3xl p-6">
                                            <DialogHeader>
                                                <DialogTitle className="font-serif text-3xl text-primary border-b-2 border-accent/20 pb-3 mb-4">Detail Pendaftar</DialogTitle>
                                            </DialogHeader>
                                            <div className="space-y-6">
                                                <div className="grid grid-cols-2 gap-4 text-sm bg-white p-5 rounded-2xl border border-border/80 shadow-sm">
                                                    <div>
                                                        <span className="text-muted-foreground block mb-1 text-xs uppercase tracking-wider font-semibold">Nama Lengkap</span>
                                                        <span className="font-semibold text-foreground text-base">{sub.applicant_name}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-muted-foreground block mb-1 text-xs uppercase tracking-wider font-semibold">NIM</span>
                                                        <span className="font-semibold text-foreground text-base">{sub.applicant_nim}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-muted-foreground block mb-1 text-xs uppercase tracking-wider font-semibold">Email</span>
                                                        <span className="font-semibold text-foreground text-base">{sub.applicant_email}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-muted-foreground block mb-1 text-xs uppercase tracking-wider font-semibold">Tanggal Daftar</span>
                                                        <span className="font-semibold text-foreground text-base">{new Date(sub.submitted_at).toLocaleString("id-ID")}</span>
                                                    </div>
                                                </div>

                                                <div>
                                                    <h4 className="font-serif text-xl font-semibold text-foreground mb-3 border-b-2 border-border/50 pb-2">Jawaban Form</h4>
                                                    <div className="space-y-5 bg-white p-5 rounded-2xl border border-border/80 shadow-sm">
                                                        {sub.answers ? Object.entries(sub.answers).map(([question, answer]) => (
                                                            <div key={question}>
                                                                <span className="text-muted-foreground block text-sm mb-1">{question}</span>
                                                                <span className="text-foreground font-medium whitespace-pre-wrap block bg-background/50 p-3 rounded-xl">
                                                                    {Array.isArray(answer) ? answer.join(", ") : String(answer)}
                                                                </span>
                                                            </div>
                                                        )) : (
                                                            <p className="text-muted-foreground italic">Tidak ada jawaban</p>
                                                        )}
                                                    </div>
                                                </div>

                                                {sub.files && sub.files.length > 0 && (
                                                    <div>
                                                        <h4 className="font-serif text-xl font-semibold text-foreground mb-3 border-b-2 border-border/50 pb-2">Lampiran File</h4>
                                                        <div className="flex flex-col gap-3">
                                                            {sub.files.map((fileUrl, i) => (
                                                                <a
                                                                    key={i}
                                                                    href={fileUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="flex items-center justify-between p-4 bg-white rounded-2xl border hover:border-accent hover:shadow-md transition-all text-sm font-semibold text-primary group"
                                                                >
                                                                    <span className="flex items-center">
                                                                        <ExternalLink className="w-5 h-5 mr-3 text-accent group-hover:text-primary transition-colors" />
                                                                        Buka File {i + 1}
                                                                    </span>
                                                                    <span className="text-muted-foreground group-hover:text-foreground text-xs font-normal">Lihat Dokumen &rarr;</span>
                                                                </a>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </TableCell>
                            </TableRow>
                        ))}
                        {submissions.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground font-medium">
                                    Belum ada pendaftar.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-end space-x-2 py-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/admin/recruitments/${recruitmentId}/applicants?page=${currentPage - 1}`)}
                        disabled={currentPage <= 1}
                    >
                        Previous
                    </Button>
                    <div className="text-sm text-muted-foreground font-medium px-4">
                        Halaman {currentPage} dari {totalPages}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/admin/recruitments/${recruitmentId}/applicants?page=${currentPage + 1}`)}
                        disabled={currentPage >= totalPages}
                    >
                        Next
                    </Button>
                </div>
            )}
        </div>
    );
}
