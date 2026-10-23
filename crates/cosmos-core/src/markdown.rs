use comrak::{
    Arena, Options,
    nodes::{AstNode, NodeValue},
    parse_document,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Heading {
    pub level: u8,
    pub text: String,
}
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Link {
    pub destination: String,
    pub text: String,
}
#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Inspection {
    pub headings: Vec<Heading>,
    pub links: Vec<Link>,
}

fn plain_text<'a>(node: &'a AstNode<'a>) -> String {
    let mut text = String::new();
    for descendant in node.descendants() {
        match &descendant.data.borrow().value {
            NodeValue::Text(value) => text.push_str(value),
            NodeValue::Code(value) => text.push_str(&value.literal),
            NodeValue::SoftBreak | NodeValue::LineBreak => text.push('\n'),
            _ => {}
        }
    }
    text
}

/// Read-only inspection; never reformat or write the input Markdown.
pub fn inspect_markdown(source: &str) -> Inspection {
    let arena = Arena::new();
    let mut options = Options::default();
    options.extension.front_matter_delimiter = Some("---".into());
    options.extension.strikethrough = true;
    options.extension.table = true;
    options.extension.tasklist = true;
    options.extension.autolink = true;
    let root = parse_document(&arena, source, &options);
    let mut inspection = Inspection {
        headings: vec![],
        links: vec![],
    };
    for node in root.descendants() {
        match &node.data.borrow().value {
            NodeValue::Heading(heading) => inspection.headings.push(Heading {
                level: heading.level,
                text: plain_text(node),
            }),
            NodeValue::Link(link) => inspection.links.push(Link {
                destination: link.url.clone(),
                text: plain_text(node),
            }),
            _ => {}
        }
    }
    inspection
}
