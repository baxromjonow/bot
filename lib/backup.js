import writeExcelFile from "write-excel-file/node";
import { selectAll } from "./supabase.js";

function headerCell(value) {
  return {
    value,
    fontWeight: "bold",
    backgroundColor: "#EAF2FF",
    align: "center"
  };
}

export async function createBackupWorkbook() {
  const quizzes = await selectAll(
    "quizzes",
    "select=id,category,question,options,correct_option,explanation,status,created_at,sent_at&order=id.asc"
  );
  const groups = await selectAll(
    "groups",
    "select=chat_id,title,active,added_at&order=added_at.asc"
  );

  const quizData = [
    [
      "ID",
      "Kategoriya",
      "Savol",
      "Variant 1",
      "Variant 2",
      "Variant 3",
      "Variant 4",
      "To'g'ri javob",
      "Izoh",
      "Holat",
      "Yaratilgan",
      "Yuborilgan"
    ].map(headerCell),
    ...quizzes.map((q) => [
      q.id,
      q.category || "",
      q.question,
      q.options?.[0] || "",
      q.options?.[1] || "",
      q.options?.[2] || "",
      q.options?.[3] || "",
      Number(q.correct_option) + 1,
      q.explanation || "",
      q.status || "",
      q.created_at || "",
      q.sent_at || ""
    ])
  ];

  const groupData = [
    ["Chat_ID", "Guruh", "Faol", "Qo‘shilgan"].map(headerCell),
    ...groups.map((g) => [
      String(g.chat_id),
      g.title || "",
      g.active ? "Ha" : "Yo‘q",
      g.added_at || ""
    ])
  ];

  return writeExcelFile([
    {
      data: quizData,
      sheet: "Quizlar",
      stickyRowsCount: 1,
      columns: [
        { width: 10 },
        { width: 18 },
        { width: 42 },
        { width: 28 },
        { width: 28 },
        { width: 28 },
        { width: 28 },
        { width: 14 },
        { width: 45 },
        { width: 14 },
        { width: 24 },
        { width: 24 }
      ]
    },
    {
      data: groupData,
      sheet: "Guruhlar",
      stickyRowsCount: 1,
      columns: [
        { width: 24 },
        { width: 36 },
        { width: 12 },
        { width: 24 }
      ]
    }
  ]).toBuffer();
}
