"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, ExternalLink, Eye } from "lucide-react";
import Papa from "papaparse";

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

export function ApplicantTable({ submissions, recruitmentTitle }: { submissions: Submission[]; recruitmentTitle: string }) {
    const exportToCSV = () => {
        // Flatten data for CSV
        const data = submissions.map((sub, i) => {
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
            <div className="flex justify-end">
                <Button onClick={exportToCSV} className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm rounded-xl px-6">
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                </Button>
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
        </div>
    );
}
